"use node"

import { anthropic } from "@ai-sdk/anthropic"
import {
  openai,
  type OpenaiResponsesTextProviderMetadata,
} from "@ai-sdk/openai"
import { xai } from "@ai-sdk/xai"
import { generateText, Output } from "ai"
import { z } from "zod"

import { internal } from "./_generated/api"
import { action, internalAction } from "./_generated/server"
import type { ActionCtx } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { v } from "convex/values"
import { researchStatusValidator } from "./schema"
import {
  catalystResearchAiSchema,
  normalizeCatalystResearchAi,
  type CatalystResearch,
} from "../lib/research-contract"
import {
  buildResearchCandidates,
  buildSearchQueries,
  compactWhitespace,
  diversifySnippetsByDomain,
  selectBalancedSearchPlan,
  type ResearchCandidate,
  type SearchQuery,
  type SearchQueryDiagnostic,
  type SourceSnippet,
} from "../lib/research-discovery"
import {
  isTickerSymbolSyntaxValid,
  normalizeTickerSymbol,
} from "../lib/ticker-symbol"

const finnhubProfileSchema = z
  .object({
    name: z.string().optional(),
    ticker: z.string().optional(),
    exchange: z.string().optional(),
    finnhubIndustry: z.string().optional(),
    weburl: z.string().optional(),
  })
  .passthrough()

const finnhubQuoteSchema = z
  .object({
    c: z.number().optional(),
    d: z.number().optional(),
    dp: z.number().optional(),
    h: z.number().optional(),
    l: z.number().optional(),
    o: z.number().optional(),
    pc: z.number().optional(),
    t: z.number().optional(),
  })
  .passthrough()

const finnhubStockEarningsRowSchema = z.record(z.string(), z.unknown())

const MAX_RESEARCH_ATTEMPTS = 2
const MAX_WEB_SNIPPETS = 36
const ANONYMOUS_WEB_QUERY_BUDGET = 10
const MAX_DIAGNOSTIC_URLS_PER_QUERY = 6
const WEB_SNIPPET_QUOTE_LENGTH = 1200
const TICKER_VALIDATION_PROVIDER = "finnhub-profile2+quote+earnings"
const VALID_TICKER_VALIDATION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const INVALID_TICKER_VALIDATION_TTL_MS = 24 * 60 * 60 * 1000
const HOSTED_SEARCH_PROVIDERS = [
  "gemini",
  "openai",
  "anthropic",
  "xai",
] as const
const OPENAI_SEARCH_CONTEXT_SIZES = ["low", "medium", "high"] as const

type HostedSearchProvider = (typeof HOSTED_SEARCH_PROVIDERS)[number]
type OpenAiSearchContextSize = (typeof OPENAI_SEARCH_CONTEXT_SIZES)[number]

const geminiGroundedSearchSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(
                z.object({
                  text: z.string().optional(),
                })
              )
              .optional(),
          })
          .optional(),
        groundingMetadata: z
          .object({
            groundingChunks: z
              .array(
                z.object({
                  web: z
                    .object({
                      uri: z.string().optional(),
                      title: z.string().optional(),
                    })
                    .optional(),
                })
              )
              .optional(),
            webSearchQueries: z.array(z.string()).optional(),
          })
          .optional(),
      })
    )
    .optional(),
})

const openAiWebSearchToolOutputSchema = z
  .object({
    sources: z
      .array(
        z.discriminatedUnion("type", [
          z.object({
            type: z.literal("url"),
            url: z.string(),
          }),
          z.object({
            type: z.literal("api"),
            name: z.string(),
          }),
        ])
      )
      .optional(),
  })
  .passthrough()

const anthropicWebSearchToolOutputSchema = z.array(
  z.object({
    type: z.literal("web_search_result"),
    url: z.string(),
    title: z.string().nullable(),
    pageAge: z.string().nullable(),
    encryptedContent: z.string(),
  })
)

const xaiXSearchToolOutputSchema = z
  .object({
    posts: z
      .array(
        z.object({
          author: z.string(),
          text: z.string(),
          url: z.string(),
          likes: z.number(),
        })
      )
      .optional(),
  })
  .passthrough()

type TickerValidation = {
  isValid: boolean
  companyName?: string
  exchange?: string
}

type ResearchStatus = "queued" | "running" | "completed" | "failed"

type RequestRunResult = {
  runId: Id<"researchRuns">
  status: ResearchStatus
  cacheHit: boolean
}

type AnonymousRequestRunResult = RequestRunResult & {
  remainingAnonymousRuns: number
}

const requestRunReturn = v.object({
  runId: v.id("researchRuns"),
  status: researchStatusValidator,
  cacheHit: v.boolean(),
})

const anonymousRequestRunReturn = v.object({
  runId: v.id("researchRuns"),
  status: researchStatusValidator,
  cacheHit: v.boolean(),
  remainingAnonymousRuns: v.number(),
})

function normalizeSourceUrl(value: string) {
  try {
    const url = new URL(value)
    url.hash = ""

    return url.toString()
  } catch {
    return value
  }
}

function publisherFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

function isXPostPublisher(hostname: string) {
  const host = hostname.replace(/^www\./, "").toLowerCase()

  return host === "x.com" || host === "twitter.com" || host.endsWith(".x.com")
}

/** Gateway/source metadata often uses the tweet id as `title`, which is not a display title. */
function isTweetIdStyleTitle(value: string | undefined) {
  if (!value) {
    return true
  }

  const t = compactWhitespace(value)

  return t.length === 0 || /^\d+$/.test(t)
}

function titleForXPostSnippet(
  url: string,
  author: string,
  providerTitle: string | undefined
) {
  if (!isTweetIdStyleTitle(providerTitle)) {
    return compactWhitespace(providerTitle!)
  }

  const a = compactWhitespace(author)

  if (a) {
    return `${a} on X`
  }

  try {
    const path = new URL(url).pathname
    const match = path.match(/^\/([^/]+)\/status\//)

    if (match?.[1] && match[1] !== "i") {
      return `@${match[1]} on X`
    }
  } catch {
    // ignore
  }

  return "X post"
}

function isHostedSearchProvider(value: string): value is HostedSearchProvider {
  return HOSTED_SEARCH_PROVIDERS.includes(value as HostedSearchProvider)
}

function enabledHostedSearchProviders(): HostedSearchProvider[] {
  const rawProviders =
    process.env.CATALYST_HOSTED_SEARCH_PROVIDERS?.trim() ||
    process.env.CATALYST_HOSTED_SEARCH_PROVIDER

  if (!rawProviders) {
    return []
  }

  const providers: HostedSearchProvider[] = []
  for (const provider of rawProviders.split(",")) {
    const normalized = provider.trim().toLowerCase()

    if (!isHostedSearchProvider(normalized) || providers.includes(normalized)) {
      continue
    }

    providers.push(normalized)
  }

  return providers
}

function openAiSearchContextSize(): OpenAiSearchContextSize {
  const value = process.env.CATALYST_OPENAI_SEARCH_CONTEXT_SIZE?.toLowerCase()

  return OPENAI_SEARCH_CONTEXT_SIZES.includes(value as OpenAiSearchContextSize)
    ? (value as OpenAiSearchContextSize)
    : "medium"
}

function anthropicWebSearchMaxUses() {
  const value = Number(process.env.CATALYST_ANTHROPIC_WEB_SEARCH_MAX_USES)

  return Number.isInteger(value) && value > 0 ? value : 5
}

function dedupeSnippetsByUrl(snippets: SourceSnippet[], max: number) {
  const seen = new Set<string>()
  const unique: SourceSnippet[] = []

  for (const snippet of snippets) {
    const normalizedUrl = normalizeSourceUrl(snippet.url)

    if (seen.has(normalizedUrl)) {
      continue
    }

    seen.add(normalizedUrl)
    unique.push({
      ...snippet,
      url: normalizedUrl,
    })
  }

  return diversifySnippetsByDomain(unique, max)
}

function formatFinnhubEarningsRow(row: Record<string, unknown>) {
  const period =
    typeof row.period === "string"
      ? row.period
      : typeof row.quarter === "string"
        ? row.quarter
        : typeof row.year === "number"
          ? String(row.year)
          : typeof row.date === "string"
            ? row.date
            : undefined

  if (!period) {
    return null
  }

  const surprise =
    typeof row.surprisePercent === "number"
      ? ` surprise ${row.surprisePercent}%`
      : typeof row.surprise === "number"
        ? ` surprise ${row.surprise}`
        : ""

  return `${period}${surprise}`.trim()
}

async function fetchFinnhubMarketContext(symbol: string): Promise<{
  isValid: boolean
  companyName?: string
  exchange?: string
  companyWebsite?: string
  finnhubIndustry?: string
  snippets: SourceSnippet[]
}> {
  const apiKey = process.env.FINNHUB_API_KEY

  if (!apiKey) {
    return { isValid: false, snippets: [], finnhubIndustry: undefined }
  }

  const token = encodeURIComponent(apiKey)
  const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(
    symbol
  )}&token=${token}`
  const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
    symbol
  )}&token=${token}`
  const earningsUrl = `https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(
    symbol
  )}&token=${token}`

  const [profileResponse, quoteResponse, earningsResponse] = await Promise.all([
    fetch(profileUrl, {
      headers: {
        accept: "application/json",
        "user-agent": "stonkseer-research-bot/0.1",
      },
    }),
    fetch(quoteUrl, {
      headers: {
        accept: "application/json",
        "user-agent": "stonkseer-research-bot/0.1",
      },
    }),
    fetch(earningsUrl, {
      headers: {
        accept: "application/json",
        "user-agent": "stonkseer-research-bot/0.1",
      },
    }),
  ])

  if (!profileResponse.ok) {
    return { isValid: false, snippets: [], finnhubIndustry: undefined }
  }

  const profileJson: unknown = await profileResponse.json()
  const profileParsed = finnhubProfileSchema.safeParse(profileJson)

  if (!profileParsed.success) {
    return { isValid: false, snippets: [], finnhubIndustry: undefined }
  }

  const profile = profileParsed.data
  const companyName = profile.name
  const exchange = profile.exchange
  const profileTicker = profile.ticker?.toUpperCase()
  const companyWebsite =
    typeof profile.weburl === "string" ? profile.weburl : undefined

  let quoteParsed: z.infer<typeof finnhubQuoteSchema> | null = null

  if (quoteResponse.ok) {
    const quoteJson: unknown = await quoteResponse.json()
    const parsed = finnhubQuoteSchema.safeParse(quoteJson)

    if (parsed.success) {
      quoteParsed = parsed.data
    }
  }

  const hasRealtimePrice =
    typeof quoteParsed?.t === "number" && typeof quoteParsed?.c === "number"

  const isValid = Boolean(
    companyName || exchange || profileTicker === symbol || hasRealtimePrice
  )

  const snippets: SourceSnippet[] = []

  snippets.push({
    url: "https://finnhub.io/docs/api/introduction",
    title: `${symbol} Finnhub company profile`,
    publisher: "Finnhub",
    quote: [
      `Finnhub company profile data for ${symbol}.`,
      companyName ? `Name: ${companyName}.` : null,
      exchange ? `Exchange: ${exchange}.` : null,
      profile.finnhubIndustry ? `Industry: ${profile.finnhubIndustry}.` : null,
      companyWebsite ? `Website: ${companyWebsite}.` : null,
    ]
      .filter(Boolean)
      .join(" "),
  })

  if (quoteParsed && typeof quoteParsed.c === "number") {
    snippets.push({
      url: "https://finnhub.io/docs/api/quote",
      title: `${symbol} Finnhub quote snapshot`,
      publisher: "Finnhub",
      quote: `Finnhub quote snapshot includes last price ${quoteParsed.c}.`,
    })
  }

  if (earningsResponse.ok) {
    const earningsJson: unknown = await earningsResponse.json()

    if (Array.isArray(earningsJson)) {
      const rows = earningsJson
        .map((row) => finnhubStockEarningsRowSchema.safeParse(row))
        .filter((row) => row.success)
        .map((row) => row.data)

      const formatted = rows
        .map((row) => formatFinnhubEarningsRow(row))
        .filter((value): value is string => Boolean(value))
        .slice(0, 6)

      if (formatted.length > 0) {
        snippets.push({
          url: "https://finnhub.io/docs/api/stock-earnings",
          title: `${symbol} Finnhub earnings history`,
          publisher: "Finnhub",
          quote: `Finnhub earnings history includes: ${formatted.join("; ")}.`,
        })
      } else {
        snippets.push({
          url: "https://finnhub.io/docs/api/stock-earnings",
          title: `${symbol} Finnhub earnings data`,
          publisher: "Finnhub",
          quote:
            "Finnhub returned earnings-related fundamentals data for this symbol (earnings endpoint responded).",
        })
      }
    }
  }

  return {
    isValid,
    companyName,
    exchange,
    companyWebsite,
    finnhubIndustry:
      typeof profile.finnhubIndustry === "string"
        ? profile.finnhubIndustry
        : undefined,
    snippets,
  }
}

async function validateTicker(
  ctx: ActionCtx,
  symbol: string,
  now: number
): Promise<TickerValidation> {
  if (!isTickerSymbolSyntaxValid(symbol)) {
    return { isValid: false }
  }

  const cached = await ctx.runQuery(internal.tickerValidation.getCached, {
    symbol,
    provider: TICKER_VALIDATION_PROVIDER,
    now,
    validTtlMs: VALID_TICKER_VALIDATION_TTL_MS,
    invalidTtlMs: INVALID_TICKER_VALIDATION_TTL_MS,
  })

  if (cached) {
    return {
      isValid: cached.isValid,
      companyName: cached.companyName,
      exchange: cached.exchange,
    }
  }

  const finnhub = await fetchFinnhubMarketContext(symbol)
  const validation = {
    isValid: finnhub.isValid,
    companyName: finnhub.companyName,
    exchange: finnhub.exchange,
  }

  await ctx.runMutation(internal.tickerValidation.record, {
    symbol,
    isValid: validation.isValid,
    companyName: validation.companyName,
    exchange: validation.exchange,
    provider: TICKER_VALIDATION_PROVIDER,
    validatedAt: now,
  })

  return validation
}

function assertTickerExists(validation: TickerValidation) {
  if (!validation.isValid) {
    throw new Error("Ticker not found or unsupported")
  }
}

function buildGroundedSearchPrompt(
  symbol: string,
  companyName: string | undefined,
  industry: string | undefined,
  now: number,
  selectedPlan: SearchQuery[]
) {
  const today = new Date(now).toISOString().slice(0, 10)
  const companyLabel = companyName ? `${companyName} (${symbol})` : symbol
  const queryHints = selectedPlan
    .slice(0, 10)
    .map((query) => `- [${query.bucket}] ${query.query}`)
    .join("\n")

  return [
    `Today is ${today}. Search the web for upcoming stock catalysts for ${companyLabel} over the next 12 months.`,
    industry ? `Industry context: ${industry}.` : "",
    "Do not use ticker-specific event maps. Discover catalysts from current sources and infer event names, regulator timelines, launches, conferences, and partnership milestones from the web evidence.",
    "For regulated companies, explicitly look for agency reviews, license or permit decisions, environmental reviews, hearings, votes, approval deadlines, and project timelines.",
    "For product-led companies, look for recurring branded events, registration pages, venue calendars, keynotes, product launch pages, and roadmap milestones.",
    "For recently public companies, reverse mergers into listed shells, or names with heavy insider or VC holdings, look for lock-up or selling-window expirations, Rule 144 and resale registration milestones, registered directs or secondaries, and other scheduled float or insider-supply events—these are valid catalysts and often skew to the downside.",
    "Use these query themes as hints, then reformulate searches if the company uses branded names:",
    queryHints,
    "Return a concise evidence digest with source titles and URLs. Include aliases or named events you discovered.",
  ]
    .filter(Boolean)
    .join("\n\n")
}

function collectOpenAiCitationSources(
  content: readonly { type: string; providerMetadata?: unknown }[]
) {
  const sources = new Map<string, string | undefined>()

  for (const part of content) {
    if (part.type !== "text") {
      continue
    }

    const metadata = part.providerMetadata as
      | OpenaiResponsesTextProviderMetadata
      | undefined

    for (const annotation of metadata?.openai?.annotations ?? []) {
      if (annotation.type !== "url_citation") {
        continue
      }

      sources.set(normalizeSourceUrl(annotation.url), annotation.title)
    }
  }

  return sources
}

async function fetchOpenAiSearchSnippets(
  symbol: string,
  companyName: string | undefined,
  industry: string | undefined,
  now: number,
  selectedPlan: SearchQuery[]
): Promise<{
  snippets: SourceSnippet[]
  diagnostics: SearchQueryDiagnostic[]
}> {
  const model = process.env.CATALYST_OPENAI_SEARCH_MODEL
  const prompt = buildGroundedSearchPrompt(
    symbol,
    companyName,
    industry,
    now,
    selectedPlan
  )
  const diagnosticBase = {
    bucket: "market_news" as const,
    query: `OpenAI web search: ${symbol}`,
    maxResults: 10,
  }

  if (!model) {
    return {
      snippets: [],
      diagnostics: [
        {
          ...diagnosticBase,
          resultCount: 0,
          keptCount: 0,
          urls: [],
          error: "Missing CATALYST_OPENAI_SEARCH_MODEL for OpenAI web search",
        },
      ],
    }
  }

  try {
    const result = await generateText({
      model,
      tools: {
        web_search: openai.tools.webSearch({
          externalWebAccess: true,
          searchContextSize: openAiSearchContextSize(),
        }),
      },
      toolChoice: { type: "tool", toolName: "web_search" },
      prompt,
    })
    const digest = compactWhitespace(result.text)
    const sourceTitles = new Map<string, string | undefined>()

    for (const source of result.sources) {
      if (source.sourceType !== "url") {
        continue
      }

      sourceTitles.set(normalizeSourceUrl(source.url), source.title)
    }

    for (const [url, title] of collectOpenAiCitationSources(result.content)) {
      sourceTitles.set(url, title ?? sourceTitles.get(url))
    }

    for (const toolResult of result.toolResults) {
      if (toolResult.toolName !== "web_search") {
        continue
      }

      const parsedOutput = openAiWebSearchToolOutputSchema.safeParse(
        toolResult.output
      )

      if (!parsedOutput.success) {
        continue
      }

      for (const source of parsedOutput.data.sources ?? []) {
        if (source.type !== "url") {
          continue
        }

        const normalizedUrl = normalizeSourceUrl(source.url)
        sourceTitles.set(normalizedUrl, sourceTitles.get(normalizedUrl))
      }
    }

    const snippets: SourceSnippet[] = []
    const urls: string[] = []

    for (const [url, title] of sourceTitles) {
      const publisher = publisherFromUrl(url)

      if (!publisher || !digest) {
        continue
      }

      urls.push(url)
      snippets.push({
        url,
        title: title ?? url,
        publisher,
        quote: digest.slice(0, WEB_SNIPPET_QUOTE_LENGTH),
      })
    }

    return {
      snippets,
      diagnostics: [
        {
          ...diagnosticBase,
          resultCount: sourceTitles.size,
          keptCount: snippets.length,
          urls: urls.slice(0, MAX_DIAGNOSTIC_URLS_PER_QUERY),
        },
      ],
    }
  } catch (err) {
    return {
      snippets: [],
      diagnostics: [
        {
          ...diagnosticBase,
          resultCount: 0,
          keptCount: 0,
          urls: [],
          error: err instanceof Error ? err.message : String(err),
        },
      ],
    }
  }
}

async function fetchAnthropicSearchSnippets(
  symbol: string,
  companyName: string | undefined,
  industry: string | undefined,
  now: number,
  selectedPlan: SearchQuery[]
): Promise<{
  snippets: SourceSnippet[]
  diagnostics: SearchQueryDiagnostic[]
}> {
  const model = process.env.CATALYST_ANTHROPIC_SEARCH_MODEL
  const prompt = buildGroundedSearchPrompt(
    symbol,
    companyName,
    industry,
    now,
    selectedPlan
  )
  const diagnosticBase = {
    bucket: "market_news" as const,
    query: `Anthropic web search: ${symbol}`,
    maxResults: 10,
  }

  if (!model) {
    return {
      snippets: [],
      diagnostics: [
        {
          ...diagnosticBase,
          resultCount: 0,
          keptCount: 0,
          urls: [],
          error:
            "Missing CATALYST_ANTHROPIC_SEARCH_MODEL for Anthropic web search",
        },
      ],
    }
  }

  try {
    const result = await generateText({
      model,
      tools: {
        web_search: anthropic.tools.webSearch_20250305({
          maxUses: anthropicWebSearchMaxUses(),
        }),
      },
      toolChoice: { type: "tool", toolName: "web_search" },
      prompt,
    })
    const digest = compactWhitespace(result.text)
    const sourceTitles = new Map<string, string | undefined>()
    let resultCount = 0

    for (const source of result.sources) {
      if (source.sourceType !== "url") {
        continue
      }

      sourceTitles.set(normalizeSourceUrl(source.url), source.title)
    }

    for (const toolResult of result.toolResults) {
      if (toolResult.toolName !== "web_search") {
        continue
      }

      const parsedOutput = anthropicWebSearchToolOutputSchema.safeParse(
        toolResult.output
      )

      if (!parsedOutput.success) {
        continue
      }

      resultCount += parsedOutput.data.length

      for (const source of parsedOutput.data) {
        const normalizedUrl = normalizeSourceUrl(source.url)
        sourceTitles.set(
          normalizedUrl,
          source.title ?? sourceTitles.get(normalizedUrl)
        )
      }
    }

    const snippets: SourceSnippet[] = []
    const urls: string[] = []

    for (const [url, title] of sourceTitles) {
      const publisher = publisherFromUrl(url)

      if (!publisher || !digest) {
        continue
      }

      urls.push(url)
      snippets.push({
        url,
        title: title ?? url,
        publisher,
        quote: digest.slice(0, WEB_SNIPPET_QUOTE_LENGTH),
      })
    }

    return {
      snippets,
      diagnostics: [
        {
          ...diagnosticBase,
          resultCount: resultCount || sourceTitles.size,
          keptCount: snippets.length,
          urls: urls.slice(0, MAX_DIAGNOSTIC_URLS_PER_QUERY),
        },
      ],
    }
  } catch (err) {
    return {
      snippets: [],
      diagnostics: [
        {
          ...diagnosticBase,
          resultCount: 0,
          keptCount: 0,
          urls: [],
          error: err instanceof Error ? err.message : String(err),
        },
      ],
    }
  }
}

async function fetchXaiSearchSnippets(
  symbol: string,
  companyName: string | undefined,
  industry: string | undefined,
  now: number,
  selectedPlan: SearchQuery[]
): Promise<{
  snippets: SourceSnippet[]
  diagnostics: SearchQueryDiagnostic[]
}> {
  const model = process.env.CATALYST_XAI_SEARCH_MODEL
  const prompt = buildGroundedSearchPrompt(
    symbol,
    companyName,
    industry,
    now,
    selectedPlan
  )
  const diagnosticBase = {
    bucket: "market_news" as const,
    query: `xAI Grok X search: ${symbol}`,
    maxResults: 10,
  }

  if (!model) {
    return {
      snippets: [],
      diagnostics: [
        {
          ...diagnosticBase,
          resultCount: 0,
          keptCount: 0,
          urls: [],
          error: "Missing CATALYST_XAI_SEARCH_MODEL for xAI Grok X search",
        },
      ],
    }
  }

  try {
    const result = await generateText({
      model,
      tools: {
        x_search: xai.tools.xSearch({
          enableImageUnderstanding: true,
          enableVideoUnderstanding: true,
        }),
      },
      toolChoice: { type: "tool", toolName: "x_search" },
      prompt,
    })
    const sourceTitles = new Map<string, string | undefined>()

    for (const source of result.sources) {
      if (source.sourceType !== "url") {
        continue
      }

      sourceTitles.set(normalizeSourceUrl(source.url), source.title)
    }

    const snippets: SourceSnippet[] = []
    const urls: string[] = []
    const seenUrls = new Set<string>()
    let resultCount = 0

    for (const toolResult of result.toolResults) {
      if (toolResult.toolName !== "x_search") {
        continue
      }

      const parsedOutput = xaiXSearchToolOutputSchema.safeParse(
        toolResult.output
      )

      if (!parsedOutput.success) {
        continue
      }

      resultCount += parsedOutput.data.posts?.length ?? 0

      for (const post of parsedOutput.data.posts ?? []) {
        const url = normalizeSourceUrl(post.url)
        const publisher = publisherFromUrl(url)
        const author = compactWhitespace(post.author)
        const quote = compactWhitespace(post.text)

        if (!publisher || !quote || seenUrls.has(url)) {
          continue
        }

        seenUrls.add(url)
        urls.push(url)
        snippets.push({
          url,
          title: titleForXPostSnippet(url, author, sourceTitles.get(url)),
          publisher,
          quote: quote.slice(0, WEB_SNIPPET_QUOTE_LENGTH),
        })
      }
    }

    const digest = compactWhitespace(result.text)
    let fallbackFromSources = 0

    // Vercel AI Gateway can return x_search tool-call + `source` URL parts without
    // normalized `tool-result` rows; reuse the model digest as the snippet quote.
    if (snippets.length === 0 && digest) {
      for (const source of result.sources) {
        if (source.sourceType !== "url") {
          continue
        }

        const url = normalizeSourceUrl(source.url)
        const publisher = publisherFromUrl(url)

        if (!publisher || !isXPostPublisher(publisher) || seenUrls.has(url)) {
          continue
        }

        seenUrls.add(url)
        urls.push(url)
        fallbackFromSources += 1
        snippets.push({
          url,
          title: titleForXPostSnippet(url, "", source.title),
          publisher,
          quote: digest.slice(0, WEB_SNIPPET_QUOTE_LENGTH),
        })
      }
    }

    if (resultCount === 0 && fallbackFromSources > 0) {
      resultCount = fallbackFromSources
    }

    return {
      snippets,
      diagnostics: [
        {
          ...diagnosticBase,
          resultCount,
          keptCount: snippets.length,
          urls: urls.slice(0, MAX_DIAGNOSTIC_URLS_PER_QUERY),
        },
      ],
    }
  } catch (err) {
    return {
      snippets: [],
      diagnostics: [
        {
          ...diagnosticBase,
          resultCount: 0,
          keptCount: 0,
          urls: [],
          error: err instanceof Error ? err.message : String(err),
        },
      ],
    }
  }
}

async function fetchGeminiGroundedSearchSnippets(
  symbol: string,
  companyName: string | undefined,
  industry: string | undefined,
  now: number,
  selectedPlan: SearchQuery[]
): Promise<{
  snippets: SourceSnippet[]
  diagnostics: SearchQueryDiagnostic[]
}> {
  const apiKey = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_SEARCH_MODEL ?? "gemini-2.5-flash"
  const prompt = buildGroundedSearchPrompt(
    symbol,
    companyName,
    industry,
    now,
    selectedPlan
  )
  const diagnosticBase = {
    bucket: "market_news" as const,
    query: `Gemini grounded search: ${symbol}`,
    maxResults: 10,
  }

  if (!apiKey) {
    return {
      snippets: [],
      diagnostics: [
        {
          ...diagnosticBase,
          resultCount: 0,
          keptCount: 0,
          urls: [],
          error: "Missing GEMINI_API_KEY for Gemini grounded search",
        },
      ],
    }
  }

  let response: Response

  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          tools: [{ google_search: {} }],
        }),
      }
    )
  } catch (err) {
    return {
      snippets: [],
      diagnostics: [
        {
          ...diagnosticBase,
          resultCount: 0,
          keptCount: 0,
          urls: [],
          error: err instanceof Error ? err.message : String(err),
        },
      ],
    }
  }

  if (!response.ok) {
    return {
      snippets: [],
      diagnostics: [
        {
          ...diagnosticBase,
          resultCount: 0,
          keptCount: 0,
          urls: [],
          error: `Gemini HTTP ${response.status}`,
        },
      ],
    }
  }

  let json: unknown
  try {
    json = await response.json()
  } catch (err) {
    return {
      snippets: [],
      diagnostics: [
        {
          ...diagnosticBase,
          resultCount: 0,
          keptCount: 0,
          urls: [],
          error: err instanceof Error ? err.message : String(err),
        },
      ],
    }
  }

  const parsed = geminiGroundedSearchSchema.safeParse(json)
  if (!parsed.success) {
    return {
      snippets: [],
      diagnostics: [
        {
          ...diagnosticBase,
          resultCount: 0,
          keptCount: 0,
          urls: [],
          error: "Gemini response schema mismatch",
        },
      ],
    }
  }

  const candidate = parsed.data.candidates?.[0]
  const digest = compactWhitespace(
    candidate?.content?.parts
      ?.map((part) => part.text)
      .filter((text): text is string => Boolean(text))
      .join(" ") ?? ""
  )
  const snippets: SourceSnippet[] = []
  const urls: string[] = []

  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    const url = chunk.web?.uri
    const title = chunk.web?.title

    if (!url || !title || !digest) {
      continue
    }

    const normalizedUrl = normalizeSourceUrl(url)
    let publisher: string
    try {
      publisher = new URL(normalizedUrl).hostname.replace(/^www\./, "")
    } catch {
      continue
    }

    if (urls.includes(normalizedUrl)) {
      continue
    }

    urls.push(normalizedUrl)
    snippets.push({
      url: normalizedUrl,
      title,
      publisher,
      quote: digest.slice(0, WEB_SNIPPET_QUOTE_LENGTH),
    })
  }

  return {
    snippets,
    diagnostics: [
      {
        ...diagnosticBase,
        resultCount:
          candidate?.groundingMetadata?.groundingChunks?.length ??
          candidate?.groundingMetadata?.webSearchQueries?.length ??
          0,
        keptCount: snippets.length,
        urls: urls.slice(0, MAX_DIAGNOSTIC_URLS_PER_QUERY),
      },
    ],
  }
}

async function fetchHostedSearchSnippets(
  symbol: string,
  companyName: string | undefined,
  industry: string | undefined,
  now: number,
  selectedPlan: SearchQuery[]
): Promise<{
  snippets: SourceSnippet[]
  diagnostics: SearchQueryDiagnostic[]
}> {
  const providers = enabledHostedSearchProviders()

  if (providers.length === 0) {
    return { snippets: [], diagnostics: [] }
  }

  const results = await Promise.all(
    providers.map((provider) => {
      switch (provider) {
        case "gemini":
          return fetchGeminiGroundedSearchSnippets(
            symbol,
            companyName,
            industry,
            now,
            selectedPlan
          )
        case "openai":
          return fetchOpenAiSearchSnippets(
            symbol,
            companyName,
            industry,
            now,
            selectedPlan
          )
        case "anthropic":
          return fetchAnthropicSearchSnippets(
            symbol,
            companyName,
            industry,
            now,
            selectedPlan
          )
        case "xai":
          return fetchXaiSearchSnippets(
            symbol,
            companyName,
            industry,
            now,
            selectedPlan
          )
      }
    })
  )

  return {
    snippets: dedupeSnippetsByUrl(
      results.flatMap((result) => result.snippets),
      MAX_WEB_SNIPPETS
    ),
    diagnostics: results.flatMap((result) => result.diagnostics),
  }
}

function buildDeterministicEvents(
  symbol: string,
  snippets: SourceSnippet[]
): CatalystResearch["events"] {
  const earningsSnippet = snippets.find((snippet) =>
    snippet.quote.toLowerCase().includes("earnings")
  )

  if (!earningsSnippet) {
    return []
  }

  return [
    {
      title: `${symbol} earnings calendar window`,
      summary:
        "Earnings window from a finance calendar; confirm dates on the company IR site.",
      whyItMatters:
        "Earnings can reset guidance, margins, and how the market prices the stock.",
      eventType: "earnings",
      datePrecision: "unknown",
      confidence: 0.55,
      status: "likely",
      expectedImpact: "medium",
      sources: [
        {
          url: earningsSnippet.url,
          title: earningsSnippet.title,
          publisher: earningsSnippet.publisher,
          publishedAt: earningsSnippet.publishedAt,
          quote: earningsSnippet.quote,
          supportsFields: ["eventType", "summary"],
        },
      ],
    },
  ]
}

async function buildAiEvents(
  symbol: string,
  snippets: SourceSnippet[],
  candidates: ResearchCandidate[],
  now: number
): Promise<CatalystResearch | null> {
  const model = process.env.AI_GATEWAY_MODEL

  if (!model || snippets.length === 0) {
    return null
  }

  const prompt = [
    `Today is ${new Date(now).toISOString().slice(0, 10)}. Extract upcoming catalyst events for ${symbol} over the next 12 months.`,
    "Use only the source snippets below. Do not invent events.",
    "Every event must include at least one source copied from the snippets and must be excluded if no snippet supports it.",
    "Look beyond earnings. Prioritize material stock-moving catalysts: product launches, production ramps, regulatory approvals, market expansion, investor days, recurring branded company events, developer/customer conferences, product keynotes, corporate presentations, shareholder meetings, partnerships and strategic deals, spin-offs/M&A/corporate actions, lock-up or selling-window expirations and other float or insider-supply milestones, management guidance, capex milestones, legal decisions, contracts, clinical/data readouts, and commercialization milestones.",
    "Treat candidate leads as routing hints, not facts. Resolve ambiguous product names to the actual company event, regulator, program, or launch milestone only when the snippets support that connection.",
    "Scheduled insider-supply or lock-up milestones are in scope when snippets support them; whyItMatters should spell out downside or dilution risk when that is the credible read.",
    "For regulated industries, look carefully for permit, license, agency review, environmental review, hearing, vote, and approval timelines even when the event is not marketed as a conference or launch.",
    "Classify eventType using: earnings, product, regulatory, launch, investor_day, conference (trade shows, keynote slots, sell-side conferences, webcast-only conference tracks), partnership (JVs, OEM, major customer or collaboration deals), corporate (M&A, spin-offs, reorgs, financings, proxy votes, lock-up or selling-window expirations, Rule 144 or resale windows, registered secondaries or directs that add tradable supply), macro, legal, other.",
    "When snippets clearly describe the same real-world occasion (same named flagship or recurring company event, same schedule or venue, same official registration or agenda page), output one merged event—not separate rows for 'the conference' versus 'expected announcements there'. Put likely product or AI reveals in summary and whyItMatters; pick the dominant eventType (often conference or investor_day for the umbrella moment).",
    "Roadmap or target milestones are allowed when supported by company statements, filings, transcripts, regulator pages, exchange calendars, or credible reporting. Use status 'likely' or 'speculative' and lower confidence when timing is inferred from a target, cadence, or historical calendar pattern.",
    "Do not require exact dates. Use expectedDate for exact dates, windowStart/windowEnd for month/quarter/season/year-end windows, and datePrecision to show how specific the timing is.",
    "Exclude stale past events unless a source clearly supports a future recurrence or future milestone.",
    "Return up to 12 highest-impact events, ordered chronologically when timing is known.",
    "Prefer confirmed company, exchange, regulator, SEC, or investor relations sources over commentary.",
    "When hosted search providers disagree, keep only events supported by concrete source snippets and prefer primary sources over provider summaries.",
    "Use null for unknown company, exchange, publication date, or event date fields.",
    "Copy source url, title, publisher, publishedAt, and quote from the snippets instead of paraphrasing source metadata.",
    "summary: Factual what/when/context only, in 1–2 short sentences (or one tight sentence). Do not repeat the title, do not explain importance here, no bullet lists, no long hedging.",
    "whyItMatters: One short sentence (two only if strictly necessary) on why the stock might move (e.g. guidance, multiple, regulatory binary, demand). Do not restate the full summary.",
    "Candidate leads detected from the snippets:",
    JSON.stringify(candidates, null, 2),
    "Source snippets:",
    JSON.stringify(snippets, null, 2),
  ].join("\n\n")

  const { output } = await generateText({
    model,
    output: Output.object({
      schema: catalystResearchAiSchema,
    }),
    prompt,
  })

  return normalizeCatalystResearchAi(output)
}

function getMissingBroadResearchConfig() {
  const missing: string[] = []

  if (!process.env.AI_GATEWAY_MODEL) {
    missing.push("AI_GATEWAY_MODEL")
  }

  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    missing.push("AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN")
  }

  return missing
}

export const requestAuthenticatedRun = action({
  args: {
    symbol: v.string(),
    now: v.number(),
  },
  returns: requestRunReturn,
  handler: async (ctx, args): Promise<RequestRunResult> => {
    const symbol = normalizeTickerSymbol(args.symbol)
    const validation = await validateTicker(ctx, symbol, args.now)
    assertTickerExists(validation)

    const result: RequestRunResult = await ctx.runMutation(
      internal.research.requestAuthenticatedRun,
      {
        symbol,
        now: args.now,
      }
    )

    return result
  },
})

export const requestAnonymousRun = action({
  args: {
    symbol: v.string(),
    anonymousTokenHash: v.string(),
    anonymousIpHash: v.string(),
    dayKey: v.string(),
    now: v.number(),
  },
  returns: anonymousRequestRunReturn,
  handler: async (ctx, args): Promise<AnonymousRequestRunResult> => {
    const symbol = normalizeTickerSymbol(args.symbol)
    const validation = await validateTicker(ctx, symbol, args.now)
    assertTickerExists(validation)

    const result: AnonymousRequestRunResult = await ctx.runMutation(
      internal.research.requestAnonymousRun,
      {
        symbol,
        anonymousTokenHash: args.anonymousTokenHash,
        anonymousIpHash: args.anonymousIpHash,
        dayKey: args.dayKey,
        now: args.now,
      }
    )

    return result
  },
})

export const runResearch = internalAction({
  args: {
    runId: v.id("researchRuns"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.researchInternal.getRun, {
      runId: args.runId,
    })

    if (!run) {
      throw new Error("Research run not found")
    }

    if (run.attemptCount >= MAX_RESEARCH_ATTEMPTS) {
      await ctx.runMutation(internal.researchInternal.markFailed, {
        runId: args.runId,
        error: "Research retry limit reached",
      })
      return null
    }

    await ctx.runMutation(internal.researchInternal.markStarted, {
      runId: args.runId,
      model: process.env.AI_GATEWAY_MODEL,
    })

    try {
      const tickerValidation = await validateTicker(ctx, run.symbol, Date.now())
      assertTickerExists(tickerValidation)

      const finnhub = await fetchFinnhubMarketContext(run.symbol)
      const researchStartedAt = Date.now()
      const companyNameForSearch =
        finnhub.companyName ?? tickerValidation.companyName
      const webSearchPlan = buildSearchQueries(
        run.symbol,
        companyNameForSearch,
        finnhub.companyWebsite,
        researchStartedAt,
        finnhub.finnhubIndustry
      )
      const webSearchQueryBudget =
        run.source === "anonymous"
          ? Math.min(ANONYMOUS_WEB_QUERY_BUDGET, webSearchPlan.length)
          : webSearchPlan.length
      const selectedWebSearchPlan = selectBalancedSearchPlan(
        webSearchPlan,
        webSearchQueryBudget
      )

      const hostedResearch = await fetchHostedSearchSnippets(
        run.symbol,
        companyNameForSearch,
        finnhub.finnhubIndustry,
        researchStartedAt,
        selectedWebSearchPlan
      )
      const snippets = [...finnhub.snippets, ...hostedResearch.snippets]
      const candidates = buildResearchCandidates(snippets)
      const aiResearch = await buildAiEvents(
        run.symbol,
        snippets,
        candidates,
        researchStartedAt
      )
      const events =
        aiResearch?.events ?? buildDeterministicEvents(run.symbol, snippets)

      await ctx.runMutation(
        internal.researchInternal.recordResearchDiagnostics,
        {
          runId: args.runId,
          symbol: run.symbol,
          searchQueryCount: selectedWebSearchPlan.length,
          snippetCount: snippets.length,
          candidateCount: candidates.length,
          extractionEventCount: events.length,
          queries: hostedResearch.diagnostics,
          candidates,
        }
      )

      if (events.length === 0) {
        const missingConfig = getMissingBroadResearchConfig()

        if (missingConfig.length > 0) {
          throw new Error(
            `Missing broad research configuration in Convex env: ${missingConfig.join(
              ", "
            )}.`
          )
        }

        throw new Error(
          "No cited catalyst events found from the current web/news sources."
        )
      }

      await ctx.runMutation(internal.researchInternal.upsertResearchResults, {
        runId: args.runId,
        symbol: run.symbol,
        companyName:
          aiResearch?.companyName ??
          finnhub.companyName ??
          tickerValidation.companyName,
        exchange:
          aiResearch?.exchange ?? finnhub.exchange ?? tickerValidation.exchange,
        events,
        model: process.env.AI_GATEWAY_MODEL ?? "deterministic-finnhub-snippets",
      })
    } catch (error) {
      await ctx.runMutation(internal.researchInternal.markFailed, {
        runId: args.runId,
        error:
          error instanceof Error
            ? error.message
            : "Research failed for an unknown reason",
      })
    }

    return null
  },
})

export const refreshTrackedStocks = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const queuedRunIds = await ctx.runMutation(
      internal.researchInternal.queueTrackedRefreshes,
      { now: Date.now() }
    )

    for (const runId of queuedRunIds) {
      await ctx.runAction(internal.researchActions.runResearch, { runId })
    }

    return null
  },
})
