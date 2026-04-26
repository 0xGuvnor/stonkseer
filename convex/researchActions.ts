"use node"

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

const tavilySearchSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().optional(),
        url: z.string().optional(),
        content: z.string().nullable().optional(),
        raw_content: z.string().nullable().optional(),
        published_date: z.string().nullable().optional(),
      }),
    )
    .optional(),
})

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
                }),
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
                }),
              )
              .optional(),
            webSearchQueries: z.array(z.string()).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
})

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
    symbol,
  )}&token=${token}`
  const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
    symbol,
  )}&token=${token}`
  const earningsUrl = `https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(
    symbol,
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
    companyName ||
      exchange ||
      profileTicker === symbol ||
      hasRealtimePrice,
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
  now: number,
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

async function fetchWebSearchSnippets(
  symbol: string,
  companyName: string | undefined,
  companyWebsite: string | undefined,
  now: number,
  selectedPlan: SearchQuery[],
  queryPlan?: SearchQuery[],
): Promise<{
  snippets: SourceSnippet[]
  diagnostics: SearchQueryDiagnostic[]
}> {
  const apiKey = process.env.TAVILY_API_KEY

  if (!apiKey) {
    return { snippets: [], diagnostics: [] }
  }

  const snippets: SourceSnippet[] = []
  const seenUrls = new Set<string>()
  const diagnostics: SearchQueryDiagnostic[] = []

  const plan =
    queryPlan ??
    buildSearchQueries(symbol, companyName, companyWebsite, now, undefined)

  for (const searchQuery of selectedPlan.length > 0 ? selectedPlan : plan) {
    let response: Response

    try {
      const body: Record<string, unknown> = {
        query: searchQuery.query,
        topic: searchQuery.topic ?? "finance",
        search_depth: "advanced",
        max_results: searchQuery.maxResults ?? 5,
        include_answer: false,
        include_raw_content: true,
      }

      if (searchQuery.includeDomains) {
        body.include_domains = searchQuery.includeDomains
      }

      response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      })
    } catch (err) {
      diagnostics.push({
        bucket: searchQuery.bucket,
        query: searchQuery.query,
        includeDomains: searchQuery.includeDomains,
        maxResults: searchQuery.maxResults,
        topic: searchQuery.topic,
        resultCount: 0,
        keptCount: 0,
        urls: [],
        error: err instanceof Error ? err.message : String(err),
      })
      console.warn("[tavily] fetch_error", {
        symbol,
        message: err instanceof Error ? err.message : String(err),
        queryPreview: searchQuery.query.slice(0, 120),
      })
      continue
    }

    if (!response.ok) {
      let errorBody = ""
      try {
        errorBody = (await response.text()).slice(0, 500)
      } catch {
        /* ignore */
      }
      diagnostics.push({
        bucket: searchQuery.bucket,
        query: searchQuery.query,
        includeDomains: searchQuery.includeDomains,
        maxResults: searchQuery.maxResults,
        topic: searchQuery.topic,
        resultCount: 0,
        keptCount: 0,
        urls: [],
        error: `HTTP ${response.status}`,
      })
      console.warn("[tavily] http_error", {
        symbol,
        status: response.status,
        queryPreview: searchQuery.query.slice(0, 120),
        body: errorBody || undefined,
      })
      continue
    }

    let json: unknown
    try {
      json = await response.json()
    } catch (err) {
      diagnostics.push({
        bucket: searchQuery.bucket,
        query: searchQuery.query,
        includeDomains: searchQuery.includeDomains,
        maxResults: searchQuery.maxResults,
        topic: searchQuery.topic,
        resultCount: 0,
        keptCount: 0,
        urls: [],
        error: err instanceof Error ? err.message : String(err),
      })
      console.warn("[tavily] json_parse_error", {
        symbol,
        message: err instanceof Error ? err.message : String(err),
        queryPreview: searchQuery.query.slice(0, 120),
      })
      continue
    }

    const parsed = tavilySearchSchema.safeParse(json)

    if (!parsed.success) {
      diagnostics.push({
        bucket: searchQuery.bucket,
        query: searchQuery.query,
        includeDomains: searchQuery.includeDomains,
        maxResults: searchQuery.maxResults,
        topic: searchQuery.topic,
        resultCount: 0,
        keptCount: 0,
        urls: [],
        error: "Tavily response schema mismatch",
      })
      console.warn("[tavily] schema_mismatch", {
        symbol,
        queryPreview: searchQuery.query.slice(0, 120),
        issues: parsed.error.issues.slice(0, 8),
      })
      continue
    }

    let resultCount = 0
    let keptCount = 0
    const urls: string[] = []

    for (const result of parsed.data.results ?? []) {
      resultCount += 1
      const quote = compactWhitespace(result.raw_content ?? result.content ?? "")

      if (!result.url || !result.title || !quote) {
        continue
      }

      let publisher: string
      const normalizedUrl = normalizeSourceUrl(result.url)

      try {
        publisher = new URL(normalizedUrl).hostname.replace(/^www\./, "")
      } catch {
        continue
      }

      if (seenUrls.has(normalizedUrl)) {
        continue
      }

      seenUrls.add(normalizedUrl)
      keptCount += 1
      if (urls.length < MAX_DIAGNOSTIC_URLS_PER_QUERY) {
        urls.push(normalizedUrl)
      }
      snippets.push({
        url: normalizedUrl,
        title: result.title,
        publisher,
        publishedAt: result.published_date ?? undefined,
        quote: quote.slice(0, WEB_SNIPPET_QUOTE_LENGTH),
      })
    }

    diagnostics.push({
      bucket: searchQuery.bucket,
      query: searchQuery.query,
      includeDomains: searchQuery.includeDomains,
      maxResults: searchQuery.maxResults,
      topic: searchQuery.topic,
      resultCount,
      keptCount,
      urls,
    })
  }

  return {
    snippets: diversifySnippetsByDomain(snippets, MAX_WEB_SNIPPETS),
    diagnostics,
  }
}

function hostedSearchProvider() {
  const provider = process.env.CATALYST_HOSTED_SEARCH_PROVIDER?.toLowerCase()

  return provider === "gemini" ? provider : null
}

function buildGroundedSearchPrompt(
  symbol: string,
  companyName: string | undefined,
  industry: string | undefined,
  now: number,
  selectedPlan: SearchQuery[],
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
    "Use these query themes as hints, then reformulate searches if the company uses branded names:",
    queryHints,
    "Return a concise evidence digest with source titles and URLs. Include aliases or named events you discovered.",
  ]
    .filter(Boolean)
    .join("\n\n")
}

async function fetchGeminiGroundedSearchSnippets(
  symbol: string,
  companyName: string | undefined,
  industry: string | undefined,
  now: number,
  selectedPlan: SearchQuery[],
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
    selectedPlan,
  )
  const diagnosticBase = {
    bucket: "market_news" as const,
    query: `Gemini grounded search: ${symbol}`,
    maxResults: 10,
    topic: "general" as const,
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
        model,
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
      },
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
      .join(" ") ?? "",
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
  selectedPlan: SearchQuery[],
): Promise<{
  snippets: SourceSnippet[]
  diagnostics: SearchQueryDiagnostic[]
}> {
  const provider = hostedSearchProvider()

  if (provider === "gemini") {
    return await fetchGeminiGroundedSearchSnippets(
      symbol,
      companyName,
      industry,
      now,
      selectedPlan,
    )
  }

  return { snippets: [], diagnostics: [] }
}

function buildDeterministicEvents(
  symbol: string,
  snippets: SourceSnippet[],
): CatalystResearch["events"] {
  const earningsSnippet = snippets.find((snippet) =>
    snippet.quote.toLowerCase().includes("earnings"),
  )

  if (!earningsSnippet) {
    return []
  }

  return [
    {
      title: `${symbol} earnings calendar window`,
      summary:
        "A near-term earnings window was found in a finance calendar source. Treat this as a starting point and verify against the company's investor relations site before trading.",
      whyItMatters:
        "Earnings calls can update guidance, margins, demand signals, capital allocation, and management commentary.",
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
  now: number,
): Promise<CatalystResearch | null> {
  const model = process.env.AI_GATEWAY_MODEL

  if (!model || snippets.length === 0) {
    return null
  }

  const { output } = await generateText({
    model,
    output: Output.object({
      schema: catalystResearchAiSchema,
    }),
    prompt: [
      `Today is ${new Date(now).toISOString().slice(0, 10)}. Extract upcoming catalyst events for ${symbol} over the next 12 months.`,
      "Use only the source snippets below. Do not invent events.",
      "Every event must include at least one source copied from the snippets and must be excluded if no snippet supports it.",
      "Look beyond earnings. Prioritize material stock-moving catalysts: product launches, production ramps, regulatory approvals, market expansion, investor days, recurring branded company events, developer/customer conferences, product keynotes, corporate presentations, shareholder meetings, partnerships and strategic deals, spin-offs/M&A/corporate actions, management guidance, capex milestones, legal decisions, contracts, clinical/data readouts, and commercialization milestones.",
      "Treat candidate leads as routing hints, not facts. Resolve ambiguous product names to the actual company event, regulator, program, or launch milestone only when the snippets support that connection.",
      "For regulated industries, look carefully for permit, license, agency review, environmental review, hearing, vote, and approval timelines even when the event is not marketed as a conference or launch.",
      "Classify eventType using: earnings, product, regulatory, launch, investor_day, conference (trade shows, keynote slots, sell-side conferences, webcast-only conference tracks), partnership (JVs, OEM, major customer or collaboration deals), corporate (M&A, spin-offs, reorgs, financings, proxy votes), macro, legal, other.",
      "Roadmap or target milestones are allowed when supported by company statements, filings, transcripts, regulator pages, exchange calendars, or credible reporting. Use status 'likely' or 'speculative' and lower confidence when timing is inferred from a target, cadence, or historical calendar pattern.",
      "Do not require exact dates. Use expectedDate for exact dates, windowStart/windowEnd for month/quarter/season/year-end windows, and datePrecision to show how specific the timing is.",
      "Exclude stale past events unless a source clearly supports a future recurrence or future milestone.",
      "Return up to 12 highest-impact events, ordered chronologically when timing is known.",
      "Prefer confirmed company, exchange, regulator, SEC, or investor relations sources over commentary.",
      "Use null for unknown company, exchange, publication date, or event date fields.",
      "Copy source url, title, publisher, publishedAt, and quote from the snippets instead of paraphrasing source metadata.",
      "Candidate leads detected from the snippets:",
      JSON.stringify(candidates, null, 2),
      "Source snippets:",
      JSON.stringify(snippets, null, 2),
    ].join("\n\n"),
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

  if (!process.env.TAVILY_API_KEY) {
    missing.push("TAVILY_API_KEY")
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
      },
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
      },
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
        finnhub.finnhubIndustry,
      )
      const webSearchQueryBudget =
        run.source === "anonymous"
          ? Math.min(ANONYMOUS_WEB_QUERY_BUDGET, webSearchPlan.length)
          : webSearchPlan.length
      const selectedWebSearchPlan = selectBalancedSearchPlan(
        webSearchPlan,
        webSearchQueryBudget,
      )

      const webResearch = await fetchWebSearchSnippets(
        run.symbol,
        companyNameForSearch,
        finnhub.companyWebsite,
        researchStartedAt,
        selectedWebSearchPlan,
        webSearchPlan,
      )
      const hostedResearch = await fetchHostedSearchSnippets(
        run.symbol,
        companyNameForSearch,
        finnhub.finnhubIndustry,
        researchStartedAt,
        selectedWebSearchPlan,
      )
      const snippets = [
        ...finnhub.snippets,
        ...hostedResearch.snippets,
        ...webResearch.snippets,
      ]
      const candidates = buildResearchCandidates(snippets)
      const aiResearch = await buildAiEvents(
        run.symbol,
        snippets,
        candidates,
        researchStartedAt,
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
          queries: [
            ...hostedResearch.diagnostics,
            ...webResearch.diagnostics,
          ],
          candidates,
        },
      )

      if (events.length === 0) {
        const missingConfig = getMissingBroadResearchConfig()

        if (missingConfig.length > 0) {
          throw new Error(
            `Missing broad research configuration in Convex env: ${missingConfig.join(
              ", ",
            )}.`,
          )
        }

        throw new Error(
          "No cited catalyst events found from the current web/news sources.",
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
      { now: Date.now() },
    )

    for (const runId of queuedRunIds) {
      await ctx.runAction(internal.researchActions.runResearch, { runId })
    }

    return null
  },
})
