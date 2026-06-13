"use node"

import { webSearch } from "@exalabs/ai-sdk"
import { anthropic } from "@ai-sdk/anthropic"
import { google, type GoogleGenerativeAIProviderMetadata } from "@ai-sdk/google"
import { xai } from "@ai-sdk/xai"
import { generateText, Output, stepCountIs, type ToolSet } from "ai"
import { z } from "zod"

import { internal } from "./_generated/api"
import { action, internalAction } from "./_generated/server"
import type { ActionCtx } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { v } from "convex/values"
import { researchStatusValidator } from "./schema"
import {
  catalystResearchAiSchema,
  MAX_CATALYST_EVENTS,
  normalizeCatalystResearchAi,
  type CatalystResearch,
} from "../lib/research-contract"
import {
  compactWhitespace,
  diversifySnippetsByDomain,
  excerptOnlyQuote,
  type SearchQueryDiagnostic,
  type SnippetProvenance,
  type SourceSnippet,
} from "../lib/research-discovery"
import {
  fetchExaPageContents,
  getDeepReadMaxUrls,
  mergeDeepReadSnippets,
  rankUrlsForDeepRead,
} from "../lib/research-exa"
import {
  buildFollowUpQueryPrompt,
  getFollowUpMaxQueries,
  parseFollowUpQueries,
  runFollowUpSearches,
} from "../lib/research-followup"
import { verifyAndFilterEvents } from "../lib/research-grounding"
import { formatResearchBreadthExtractionBlock } from "../lib/research-themes"
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

const finnhubEarningsCalendarRowSchema = z
  .object({
    date: z.string(),
    symbol: z.string().optional(),
    hour: z.string().optional(),
    quarter: z.number().optional(),
    year: z.number().optional(),
    epsEstimate: z.number().optional(),
  })
  .passthrough()

const finnhubEarningsCalendarSchema = z
  .object({
    earningsCalendar: z.array(finnhubEarningsCalendarRowSchema).optional(),
  })
  .passthrough()

type FinnhubEarningsCalendarRow = z.infer<typeof finnhubEarningsCalendarRowSchema>

const MAX_RESEARCH_ATTEMPTS = 2
const MAX_WEB_SNIPPETS = 64
const MAX_DIAGNOSTIC_URLS_PER_QUERY = 6
const WEB_SNIPPET_QUOTE_LENGTH = 2500
const TICKER_VALIDATION_PROVIDER = "finnhub-profile2+quote+earnings"
const VALID_TICKER_VALIDATION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const INVALID_TICKER_VALIDATION_TTL_MS = 24 * 60 * 60 * 1000
const HOSTED_SEARCH_PROVIDERS = [
  "gemini",
  "openai",
  "anthropic",
  "xai",
] as const

type HostedSearchProvider = (typeof HOSTED_SEARCH_PROVIDERS)[number]

/** One search provider's research output: the synthesized report plus attributed tool excerpts. */
type ProviderResearchResult = {
  provider: HostedSearchProvider
  report: string
  snippets: SourceSnippet[]
  seenUrls: string[]
  diagnostics: SearchQueryDiagnostic[]
}

const exaSearchApiResponseSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            url: z.string(),
            title: z.string().optional(),
            text: z.string().optional(),
            summary: z.string().optional(),
            highlights: z.array(z.string()).optional(),
          })
          .passthrough(),
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

const xaiXSearchPostSchema = z.object({
  author: z.string(),
  text: z.string(),
  url: z.string(),
  likes: z.coerce.number().optional(),
})

const xaiXSearchToolOutputSchema = z
  .object({
    posts: z.array(xaiXSearchPostSchema).optional(),
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

const missingResearchEnvWarned = new Set<string>()

/** Logs each missing-configuration case at most once per warm action isolate (reduces Convex log spam). */
function warnExpectedEnvMissing(envKeyLabel: string, detail: string) {
  if (missingResearchEnvWarned.has(envKeyLabel)) {
    return
  }

  missingResearchEnvWarned.add(envKeyLabel)
  console.warn(
    `[stonkseer-research] Expected ${envKeyLabel} is not set: ${detail}`,
  )
}

function hasAiGatewayCredential(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.VERCEL_OIDC_TOKEN?.trim(),
  )
}

function warnHostedSearchAndGatewayEnvGaps(): void {
  const providers = enabledHostedSearchProviders()
  const gatewayModel = process.env.AI_GATEWAY_MODEL?.trim()
  const needsGatewayRouting = Boolean(gatewayModel) || providers.length > 0

  if (
    needsGatewayRouting &&
    !hasAiGatewayCredential()
  ) {
    warnExpectedEnvMissing(
      "AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN",
      "needed for Gateway-routed models when AI_GATEWAY_MODEL is set and/or catalyst hosted search providers are configured in CATALYST_HOSTED_SEARCH_PROVIDERS",
    )
  }

  if (!gatewayModel && providers.length > 0) {
    warnExpectedEnvMissing(
      "AI_GATEWAY_MODEL",
      "set for structured catalyst extraction after hosted web search collects snippets",
    )
  }

  if (providers.includes("openai")) {
    if (!process.env.CATALYST_OPENAI_SEARCH_MODEL?.trim()) {
      warnExpectedEnvMissing(
        "CATALYST_OPENAI_SEARCH_MODEL",
        "required because the OpenAI + Exa hosted search provider is enabled",
      )
    }
    if (!process.env.EXA_API_KEY?.trim()) {
      warnExpectedEnvMissing(
        "EXA_API_KEY",
        "required because the OpenAI + Exa hosted search provider is enabled",
      )
    }
  }

  if (providers.includes("anthropic")) {
    if (!process.env.CATALYST_ANTHROPIC_SEARCH_MODEL?.trim()) {
      warnExpectedEnvMissing(
        "CATALYST_ANTHROPIC_SEARCH_MODEL",
        "required because the anthropic hosted search provider is enabled",
      )
    }
  }

  if (providers.includes("xai")) {
    if (!process.env.CATALYST_XAI_SEARCH_MODEL?.trim()) {
      warnExpectedEnvMissing(
        "CATALYST_XAI_SEARCH_MODEL",
        "required because the xai hosted search provider is enabled",
      )
    }
  }

  if (providers.includes("gemini")) {
    if (!process.env.CATALYST_GEMINI_SEARCH_MODEL?.trim()) {
      warnExpectedEnvMissing(
        "CATALYST_GEMINI_SEARCH_MODEL",
        "required because the gemini hosted search provider is enabled",
      )
    }
  }
}

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

/** Gateway/source metadata often uses the tweet id as `title`, which is not a display title. */
function isTweetIdStyleTitle(value: string | undefined) {
  if (!value) {
    return true
  }

  const t = compactWhitespace(value)

  return t.length === 0 || /^\d+$/.test(t)
}

/** AI SDK `generateText`: top-level `toolResults` are last-step only; earlier steps stay on `steps`. */
function* iterateXSearchToolResults(result: {
  readonly steps: ReadonlyArray<{
    readonly stepNumber: number
    readonly toolResults: ReadonlyArray<{
      readonly toolName: string
      readonly output: unknown
    }>
  }>
  readonly toolResults: ReadonlyArray<{
    readonly toolName: string
    readonly output: unknown
  }>
}) {
  const stepToolResults =
    result.steps.length > 0
      ? [...result.steps]
          .sort((a, b) => a.stepNumber - b.stepNumber)
          .flatMap((step) => [...step.toolResults])
      : [...result.toolResults]

  for (const toolResult of stepToolResults) {
    if (toolResult.toolName === "x_search") {
      yield toolResult
    }
  }
}

function* iterateWebSearchToolResults(result: {
  readonly steps: ReadonlyArray<{
    readonly stepNumber: number
    readonly toolResults: ReadonlyArray<{
      readonly toolName: string
      readonly output: unknown
    }>
  }>
  readonly toolResults: ReadonlyArray<{
    readonly toolName: string
    readonly output: unknown
  }>
}) {
  const stepToolResults =
    result.steps.length > 0
      ? [...result.steps]
          .sort((a, b) => a.stepNumber - b.stepNumber)
          .flatMap((step) => [...step.toolResults])
      : [...result.toolResults]

  for (const toolResult of stepToolResults) {
    if (toolResult.toolName === "webSearch") {
      yield toolResult
    }
  }
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

function openAiExaAgentMaxSteps(): number {
  const value = Number(process.env.CATALYST_OPENAI_EXA_AGENT_MAX_STEPS)

  return Number.isInteger(value) && value >= 2 && value <= 25 ? value : 8
}

function anthropicWebSearchMaxUses() {
  const value = Number(process.env.CATALYST_ANTHROPIC_WEB_SEARCH_MAX_USES)

  return Number.isInteger(value) && value > 0 ? value : 8
}

function dedupeSnippetsByUrl(snippets: SourceSnippet[], max: number): {
  snippets: SourceSnippet[]
  urlHitCounts: Map<string, number>
} {
  const seen = new Set<string>()
  const unique: SourceSnippet[] = []
  const urlHitCounts = new Map<string, number>()

  for (const snippet of snippets) {
    const normalizedUrl = normalizeSourceUrl(snippet.url)
    urlHitCounts.set(normalizedUrl, (urlHitCounts.get(normalizedUrl) ?? 0) + 1)

    if (seen.has(normalizedUrl)) {
      continue
    }

    seen.add(normalizedUrl)
    unique.push({
      ...snippet,
      url: normalizedUrl,
    })
  }

  return {
    snippets: diversifySnippetsByDomain(unique, max),
    urlHitCounts,
  }
}

function clipSnippetQuote(text: string): string {
  const t = compactWhitespace(text)

  if (t.length <= WEB_SNIPPET_QUOTE_LENGTH) {
    return t
  }

  return `${t.slice(0, WEB_SNIPPET_QUOTE_LENGTH - 1).trimEnd()}…`
}

function collectEvidenceFromExaToolOutputs(outputs: unknown[]) {
  const byUrl = new Map<
    string,
    { titles: string[]; excerpts: string[] }
  >()

  const bump = (url: string) => {
    const key = normalizeSourceUrl(url)
    let entry = byUrl.get(key)

    if (!entry) {
      entry = { titles: [], excerpts: [] }
      byUrl.set(key, entry)
    }

    return entry
  }

  for (const raw of outputs) {
    const parsed = exaSearchApiResponseSchema.safeParse(raw)

    if (!parsed.success) {
      continue
    }

    for (const row of parsed.data.results ?? []) {
      const entry = bump(row.url)

      if (row.title && compactWhitespace(row.title).length > 0) {
        entry.titles.push(row.title)
      }

      for (const h of row.highlights ?? []) {
        if (compactWhitespace(h).length > 0) {
          entry.excerpts.push(h)
        }
      }

      if (row.text && compactWhitespace(row.text).length > 0) {
        entry.excerpts.push(row.text)
      }

      if (row.summary && compactWhitespace(row.summary).length > 0) {
        entry.excerpts.push(row.summary)
      }
    }
  }

  return byUrl
}

function collectAnthropicCitedTextByUrl(
  sources: Array<{
    sourceType: string
    url?: string
    providerMetadata?: unknown
  }>,
): Map<string, string[]> {
  const map = new Map<string, string[]>()

  for (const source of sources) {
    if (source.sourceType !== "url" || !source.url) {
      continue
    }

    const metadata = source.providerMetadata as
      | { anthropic?: { citedText?: string; cited_text?: string } }
      | undefined

    const cited =
      metadata?.anthropic?.citedText ?? metadata?.anthropic?.cited_text

    if (!cited) {
      continue
    }

    const excerpt = compactWhitespace(cited)

    if (!excerpt) {
      continue
    }

    const key = normalizeSourceUrl(source.url)
    const list = map.get(key) ?? []
    list.push(excerpt)
    map.set(key, list)
  }

  return map
}

function extractGroundingSupportSegmentText(
  support: unknown,
  digest: string,
): string {
  if (!support || typeof support !== "object") {
    return ""
  }

  const record = support as Record<string, unknown>
  const segment = record.segment as Record<string, unknown> | undefined

  if (segment) {
    const directText = segment.text ?? segment.segmentText

    if (typeof directText === "string" && directText.trim().length > 0) {
      return compactWhitespace(directText)
    }

    const startRaw =
      segment.startIndex ?? segment.start_index ?? segment.beginIndex
    const endRaw = segment.endIndex ?? segment.end_index

    const start = typeof startRaw === "number" ? startRaw : undefined
    const end = typeof endRaw === "number" ? endRaw : undefined

    if (
      start !== undefined &&
      end !== undefined &&
      start >= 0 &&
      end <= digest.length &&
      end > start
    ) {
      return compactWhitespace(digest.slice(start, end))
    }
  }

  return ""
}

function extractGroundingChunkIndices(support: unknown): number[] {
  if (!support || typeof support !== "object") {
    return []
  }

  const record = support as Record<string, unknown>
  const raw =
    record.groundingChunkIndices ?? record.grounding_chunk_indices ?? []

  if (!Array.isArray(raw)) {
    return []
  }

  return raw.filter((value): value is number => typeof value === "number")
}

function buildGeminiQuotesPerChunkIndex(
  groundingSupports: unknown[],
  digest: string,
): Map<number, string[]> {
  const map = new Map<number, string[]>()

  for (const support of groundingSupports) {
    const piece = extractGroundingSupportSegmentText(support, digest)

    if (!piece) {
      continue
    }

    for (const index of extractGroundingChunkIndices(support)) {
      const bucket = map.get(index) ?? []
      bucket.push(piece)
      map.set(index, bucket)
    }
  }

  return map
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

async function fetchFinnhubMarketContext(
  symbol: string,
  now: number,
): Promise<{
  isValid: boolean
  companyName?: string
  exchange?: string
  companyWebsite?: string
  finnhubIndustry?: string
  snippets: SourceSnippet[]
  baselineEvents: CatalystResearch["events"]
}> {
  const apiKey = process.env.FINNHUB_API_KEY

  if (!apiKey) {
    warnExpectedEnvMissing(
      "FINNHUB_API_KEY",
      "Finnhub validates tickers and supplies company profile and earnings snippets used in research",
    )
    return {
      isValid: false,
      snippets: [],
      finnhubIndustry: undefined,
      baselineEvents: [],
    }
  }

  const token = encodeURIComponent(apiKey)
  const fromDate = new Date(now).toISOString().slice(0, 10)
  const toDate = new Date(now + 366 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(
    symbol
  )}&token=${token}`
  const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
    symbol
  )}&token=${token}`
  const earningsUrl = `https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(
    symbol
  )}&token=${token}`
  const calendarUrl = `https://finnhub.io/api/v1/calendar/earnings?from=${fromDate}&to=${toDate}&symbol=${encodeURIComponent(
    symbol
  )}&token=${token}`

  const [profileResponse, quoteResponse, earningsResponse, calendarResponse] =
    await Promise.all([
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
    fetch(calendarUrl, {
      headers: {
        accept: "application/json",
        "user-agent": "stonkseer-research-bot/0.1",
      },
    }),
  ])

  if (!profileResponse.ok) {
    return {
      isValid: false,
      snippets: [],
      finnhubIndustry: undefined,
      baselineEvents: [],
    }
  }

  const profileJson: unknown = await profileResponse.json()
  const profileParsed = finnhubProfileSchema.safeParse(profileJson)

  if (!profileParsed.success) {
    return {
      isValid: false,
      snippets: [],
      finnhubIndustry: undefined,
      baselineEvents: [],
    }
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

  snippets.push(
    finnhubSnippet({
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
    }),
  )

  if (quoteParsed && typeof quoteParsed.c === "number") {
    snippets.push(
      finnhubSnippet({
        url: "https://finnhub.io/docs/api/quote",
        title: `${symbol} Finnhub quote snapshot`,
        publisher: "Finnhub",
        quote: `Finnhub quote snapshot includes last price ${quoteParsed.c}.`,
      }),
    )
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
        snippets.push(
          finnhubSnippet({
            url: "https://finnhub.io/docs/api/stock-earnings",
            title: `${symbol} Finnhub earnings history`,
            publisher: "Finnhub",
            quote: `Finnhub earnings history includes: ${formatted.join("; ")}.`,
          }),
        )
      } else {
        snippets.push(
          finnhubSnippet({
            url: "https://finnhub.io/docs/api/stock-earnings",
            title: `${symbol} Finnhub earnings data`,
            publisher: "Finnhub",
            quote:
              "Finnhub returned earnings-related fundamentals data for this symbol (earnings endpoint responded).",
          }),
        )
      }
    }
  }

  let calendarRows: FinnhubEarningsCalendarRow[] = []

  if (calendarResponse.ok) {
    const calendarJson: unknown = await calendarResponse.json()
    const calendarParsed = finnhubEarningsCalendarSchema.safeParse(calendarJson)

    if (calendarParsed.success) {
      calendarRows = (calendarParsed.data.earningsCalendar ?? []).filter(
        (row) =>
          row.symbol?.toUpperCase() === symbol ||
          !row.symbol ||
          row.date >= fromDate,
      )
    }
  }

  if (calendarRows.length > 0) {
    const formattedCalendar = calendarRows
      .slice(0, 8)
      .map((row) => {
        const quarter =
          typeof row.quarter === "number" ? `Q${row.quarter}` : "upcoming"
        const year = typeof row.year === "number" ? String(row.year) : ""
        const hour = row.hour ? ` (${row.hour})` : ""

        return `${row.date} ${quarter} ${year}${hour}`.trim()
      })
      .join("; ")

    snippets.push(
      finnhubSnippet({
        url: "https://finnhub.io/docs/api/earnings-calendar",
        title: `${symbol} Finnhub upcoming earnings calendar`,
        publisher: "Finnhub",
        quote: `Finnhub upcoming earnings calendar for ${symbol}: ${formattedCalendar}.`,
      }),
    )
  }

  const baselineEvents = buildFinnhubBaselineEvents(symbol, snippets, calendarRows)

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
    baselineEvents,
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

  const finnhub = await fetchFinnhubMarketContext(symbol, now)
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

function buildCatalystReportPrompt(
  symbol: string,
  companyName: string | undefined,
  industry: string | undefined,
  now: number,
) {
  const today = new Date(now).toISOString().slice(0, 10)
  const companyLabel = companyName ? `${companyName} (${symbol})` : symbol

  return [
    `Today is ${today}. Research upcoming stock catalysts for ${companyLabel} over the next 12 months, then write a thorough catalyst research report.`,
    industry ? `Industry context: ${industry}.` : "",
    "Search the web repeatedly with varied queries. Start broad (recent news, upcoming catalysts and milestones, investor updates), then run targeted follow-up searches on the specific leads you discover—named programs, products, factories or sites, regulatory processes, partners, and executive statements.",
    "Look beyond official press releases and scheduled events: include qualitative and strategic milestones such as regional regulatory rollouts and approvals, product unveils and launches, manufacturing or capacity ramps, named internal programs, partnerships, supply or float milestones, and management targets discussed in credible reporting.",
    "Also include scheduled events (earnings, investor days, shareholder meetings, flagship conferences), but do not let them crowd out strategic milestones.",
    "Do not use ticker-specific event maps or preconceived event lists—derive everything from what current sources actually discuss.",
    "Write the report as a list of distinct catalysts. For each catalyst give: a short name, expected timing (exact date, bounded window, deadline, fuzzy period, ongoing/open-ended, or timing unclear), whether it is confirmed, likely, or speculative, what it is, why it could move the stock, and the source URLs that support it.",
    "For ongoing or open-ended milestones, describe timing qualitatively (e.g. gradual rollout, under review) — do not invent a one-year end date from the research scope.",
    "Distinguish milestones already in progress (cite when they began if sources say so) from those expected to begin in the future.",
    "Cover every distinct material milestone family that credible sources discuss—do not collapse the report into one theme.",
  ]
    .filter(Boolean)
    .join("\n\n")
}

const HOSTED_SEARCH_SYSTEM_PROMPT =
  "You are an equity research analyst. Use the web search tools repeatedly with varied queries: begin broad, then run targeted follow-up searches on specific leads you discover (named programs, products, sites, regulators, partners). Then write a thorough catalyst report that keeps concrete source URLs attached to every claim—covering all major themes you find, not only the single highest-profile story."

function buildCompanyContextBlock(finnhub: {
  companyName?: string
  exchange?: string
  companyWebsite?: string
  finnhubIndustry?: string
}): string {
  return [
    finnhub.companyName ? `Company name: ${finnhub.companyName}.` : null,
    finnhub.exchange ? `Exchange: ${finnhub.exchange}.` : null,
    finnhub.finnhubIndustry ? `Industry: ${finnhub.finnhubIndustry}.` : null,
    finnhub.companyWebsite ? `Website: ${finnhub.companyWebsite}.` : null,
  ]
    .filter(Boolean)
    .join(" ")
}

function snippetFromToolExcerpt(input: {
  url: string
  title: string
  publisher: string
  quote: string
  publishedAt?: string
  provenance?: SnippetProvenance
}): SourceSnippet | null {
  if (!compactWhitespace(input.quote)) {
    return null
  }

  return {
    url: input.url,
    title: input.title,
    publisher: input.publisher,
    quote: clipSnippetQuote(input.quote),
    ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
    provenance: input.provenance ?? "tool_excerpt",
  }
}

function finnhubSnippet(input: Omit<SourceSnippet, "provenance">): SourceSnippet {
  return {
    ...input,
    provenance: "finnhub_metadata",
  }
}

function emptyProviderResult(
  provider: HostedSearchProvider,
  diagnosticBase: Omit<SearchQueryDiagnostic, "resultCount" | "keptCount" | "urls">,
  error: string,
): ProviderResearchResult {
  return {
    provider,
    report: "",
    snippets: [],
    seenUrls: [],
    diagnostics: [
      {
        ...diagnosticBase,
        resultCount: 0,
        keptCount: 0,
        urls: [],
        error,
      },
    ],
  }
}

async function fetchOpenAiProviderResearch(
  symbol: string,
  companyName: string | undefined,
  industry: string | undefined,
  now: number,
): Promise<ProviderResearchResult> {
  const model = process.env.CATALYST_OPENAI_SEARCH_MODEL
  const exaApiKey = process.env.EXA_API_KEY
  const prompt = buildCatalystReportPrompt(symbol, companyName, industry, now)
  const diagnosticBase = {
    bucket: "provider_report",
    query: `GPT + Exa web search: ${symbol}`,
    maxResults: 10,
  }

  if (!model) {
    return emptyProviderResult(
      "openai",
      diagnosticBase,
      "Missing CATALYST_OPENAI_SEARCH_MODEL (GPT orchestrator for Exa web search)",
    )
  }

  if (!exaApiKey) {
    return emptyProviderResult(
      "openai",
      diagnosticBase,
      "Missing EXA_API_KEY for Exa web search tool",
    )
  }

  try {
    const result = await generateText({
      model,
      system: HOSTED_SEARCH_SYSTEM_PROMPT,
      tools: {
        webSearch: webSearch({
          apiKey: exaApiKey,
          type: "auto",
          numResults: 12,
          contents: {
            text: { maxCharacters: WEB_SNIPPET_QUOTE_LENGTH },
            livecrawl: "fallback",
          },
        }),
      },
      stopWhen: stepCountIs(openAiExaAgentMaxSteps()),
      prompt,
    })

    const report = compactWhitespace(result.text)
    const toolOutputs: unknown[] = []

    for (const toolResult of iterateWebSearchToolResults(result)) {
      toolOutputs.push(toolResult.output)
    }

    const citationInfo = collectEvidenceFromExaToolOutputs(toolOutputs)
    const sourceTitles = new Map<string, string | undefined>()

    for (const [url, info] of citationInfo) {
      const preferredTitle = info.titles.find(
        (title) => compactWhitespace(title).length > 0,
      )
      sourceTitles.set(url, preferredTitle)
    }

    for (const source of result.sources) {
      if (source.sourceType !== "url") {
        continue
      }

      const normalized = normalizeSourceUrl(source.url)
      const existing = sourceTitles.get(normalized)

      if (!existing || compactWhitespace(existing).length === 0) {
        sourceTitles.set(normalized, source.title ?? existing)
      }
    }

    const snippets: SourceSnippet[] = []
    const urls: string[] = []

    for (const [url, title] of sourceTitles) {
      const publisher = publisherFromUrl(url)

      if (!publisher) {
        continue
      }

      const excerpt = excerptOnlyQuote(
        citationInfo.get(url)?.excerpts,
        WEB_SNIPPET_QUOTE_LENGTH,
      )

      if (!excerpt) {
        continue
      }

      const snippet = snippetFromToolExcerpt({
        url,
        title: title ?? url,
        publisher,
        quote: excerpt,
        provenance: "tool_excerpt",
      })

      if (!snippet) {
        continue
      }

      urls.push(url)
      snippets.push(snippet)
    }

    return {
      provider: "openai",
      report,
      snippets,
      seenUrls: [...sourceTitles.keys()],
      diagnostics: [
        {
          ...diagnosticBase,
          resultCount: sourceTitles.size,
          keptCount: snippets.length,
          urls: urls.slice(0, MAX_DIAGNOSTIC_URLS_PER_QUERY),
          reportChars: report.length,
        },
      ],
    }
  } catch (err) {
    return emptyProviderResult(
      "openai",
      diagnosticBase,
      err instanceof Error ? err.message : String(err),
    )
  }
}

async function fetchAnthropicProviderResearch(
  symbol: string,
  companyName: string | undefined,
  industry: string | undefined,
  now: number,
): Promise<ProviderResearchResult> {
  const model = process.env.CATALYST_ANTHROPIC_SEARCH_MODEL
  const prompt = buildCatalystReportPrompt(symbol, companyName, industry, now)
  const diagnosticBase = {
    bucket: "provider_report",
    query: `Anthropic web search: ${symbol}`,
    maxResults: 10,
  }

  if (!model) {
    return emptyProviderResult(
      "anthropic",
      diagnosticBase,
      "Missing CATALYST_ANTHROPIC_SEARCH_MODEL for Anthropic web search",
    )
  }

  try {
    const result = await generateText({
      model,
      system: HOSTED_SEARCH_SYSTEM_PROMPT,
      tools: {
        web_search: anthropic.tools.webSearch_20250305({
          maxUses: anthropicWebSearchMaxUses(),
        }),
      },
      toolChoice: { type: "tool", toolName: "web_search" },
      prompt,
    })
    const report = compactWhitespace(result.text)
    const citedByUrl = collectAnthropicCitedTextByUrl(result.sources)
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

      if (!publisher) {
        continue
      }

      const excerpts = citedByUrl.get(url)
      const excerpt = excerptOnlyQuote(
        excerpts ? [...excerpts] : undefined,
        WEB_SNIPPET_QUOTE_LENGTH,
      )

      if (!excerpt) {
        continue
      }

      const snippet = snippetFromToolExcerpt({
        url,
        title: title ?? url,
        publisher,
        quote: excerpt,
        provenance: "tool_excerpt",
      })

      if (!snippet) {
        continue
      }

      urls.push(url)
      snippets.push(snippet)
    }

    return {
      provider: "anthropic",
      report,
      snippets,
      seenUrls: [...sourceTitles.keys()],
      diagnostics: [
        {
          ...diagnosticBase,
          resultCount: resultCount || sourceTitles.size,
          keptCount: snippets.length,
          urls: urls.slice(0, MAX_DIAGNOSTIC_URLS_PER_QUERY),
          reportChars: report.length,
        },
      ],
    }
  } catch (err) {
    return emptyProviderResult(
      "anthropic",
      diagnosticBase,
      err instanceof Error ? err.message : String(err),
    )
  }
}

async function fetchXaiProviderResearch(
  symbol: string,
  companyName: string | undefined,
  industry: string | undefined,
  now: number,
): Promise<ProviderResearchResult> {
  const model = process.env.CATALYST_XAI_SEARCH_MODEL
  const prompt = buildCatalystReportPrompt(symbol, companyName, industry, now)
  const diagnosticBase = {
    bucket: "provider_report",
    query: `xAI Grok X search: ${symbol}`,
    maxResults: 10,
  }

  if (!model) {
    return emptyProviderResult(
      "xai",
      diagnosticBase,
      "Missing CATALYST_XAI_SEARCH_MODEL for xAI Grok X search",
    )
  }

  try {
    const result = await generateText({
      model,
      system: HOSTED_SEARCH_SYSTEM_PROMPT,
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
    // Raw post count from successfully parsed tool outputs (before URL dedupe).
    let resultCount = 0

    for (const toolResult of iterateXSearchToolResults(result)) {
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
        const snippet = snippetFromToolExcerpt({
          url,
          title: titleForXPostSnippet(url, author, sourceTitles.get(url)),
          publisher,
          quote,
          provenance: "tool_excerpt",
        })

        if (!snippet) {
          continue
        }

        snippets.push(snippet)
      }
    }

    const report = compactWhitespace(result.text)
    const allSeenUrls = new Set(seenUrls)

    for (const url of sourceTitles.keys()) {
      allSeenUrls.add(url)
    }

    return {
      provider: "xai",
      report,
      snippets,
      seenUrls: [...allSeenUrls],
      diagnostics: [
        {
          ...diagnosticBase,
          resultCount,
          keptCount: snippets.length,
          urls: urls.slice(0, MAX_DIAGNOSTIC_URLS_PER_QUERY),
          reportChars: report.length,
        },
      ],
    }
  } catch (err) {
    return emptyProviderResult(
      "xai",
      diagnosticBase,
      err instanceof Error ? err.message : String(err),
    )
  }
}

async function fetchGeminiProviderResearch(
  symbol: string,
  companyName: string | undefined,
  industry: string | undefined,
  now: number,
): Promise<ProviderResearchResult> {
  const model = process.env.CATALYST_GEMINI_SEARCH_MODEL
  const prompt = buildCatalystReportPrompt(symbol, companyName, industry, now)
  const diagnosticBase = {
    bucket: "provider_report",
    query: `Gemini Google search: ${symbol}`,
    maxResults: 10,
  }

  if (!model) {
    return emptyProviderResult(
      "gemini",
      diagnosticBase,
      "Missing CATALYST_GEMINI_SEARCH_MODEL for Gemini Google search (AI Gateway model id, e.g. google/gemini-2.5-flash)",
    )
  }

  try {
    const result = await generateText({
      model,
      system: HOSTED_SEARCH_SYSTEM_PROMPT,
      tools: {
        google_search: google.tools.googleSearch({}),
      } as ToolSet,
      toolChoice: { type: "tool", toolName: "google_search" },
      prompt,
    })

    const digest = compactWhitespace(result.text)
    const googleMeta =
      result.providerMetadata?.google as GoogleGenerativeAIProviderMetadata | undefined

    const grounding = googleMeta?.groundingMetadata

    const supportsUnknown =
      grounding?.groundingSupports != null &&
      Array.isArray(grounding.groundingSupports)
        ? (grounding.groundingSupports as unknown[])
        : ([] as unknown[])

    const quotesByChunk = buildGeminiQuotesPerChunkIndex(supportsUnknown, digest)

    type GeminiWebChunk = {
      web?: { uri?: string | null; title?: string | null } | null
    }

    const groundingChunksUnknown = grounding?.groundingChunks
    const chunks: GeminiWebChunk[] =
      groundingChunksUnknown !== null &&
      groundingChunksUnknown !== undefined &&
      Array.isArray(groundingChunksUnknown)
        ? (groundingChunksUnknown as GeminiWebChunk[])
        : []

    const sourceTitles = new Map<string, string | undefined>()

    for (const source of result.sources) {
      if (source.sourceType !== "url") {
        continue
      }

      sourceTitles.set(normalizeSourceUrl(source.url), source.title ?? undefined)
    }

    const snippets: SourceSnippet[] = []
    const urls: string[] = []
    const seenUrls = new Set<string>(sourceTitles.keys())

    for (const [chunkIndex, chunk] of chunks.entries()) {
      const uri = chunk.web?.uri ?? undefined

      if (!uri) {
        continue
      }

      const normalizedUrl = normalizeSourceUrl(uri)
      seenUrls.add(normalizedUrl)
      const publisher = publisherFromUrl(normalizedUrl)

      if (!publisher) {
        continue
      }

      const preferredTitle =
        compactWhitespace(chunk.web?.title ?? "") ||
        sourceTitles.get(normalizedUrl)

      const title =
        preferredTitle &&
        compactWhitespace(preferredTitle).length > 0 ?
          compactWhitespace(preferredTitle)
        : publisher

      if (urls.includes(normalizedUrl)) {
        continue
      }

      const excerpt = excerptOnlyQuote(
        quotesByChunk.get(chunkIndex),
        WEB_SNIPPET_QUOTE_LENGTH,
      )

      if (!excerpt) {
        continue
      }

      const snippet = snippetFromToolExcerpt({
        url: normalizedUrl,
        title,
        publisher,
        quote: excerpt,
        provenance: "tool_excerpt",
      })

      if (!snippet) {
        continue
      }

      urls.push(normalizedUrl)
      snippets.push(snippet)
    }

    const queriesLen =
      grounding?.webSearchQueries != null &&
      Array.isArray(grounding.webSearchQueries)
        ? grounding.webSearchQueries.length
        : 0

    const resultCount =
      chunks.length !== 0 ? chunks.length : queriesLen || snippets.length || 0

    return {
      provider: "gemini",
      report: digest,
      snippets,
      seenUrls: [...seenUrls],
      diagnostics: [
        {
          ...diagnosticBase,
          resultCount,
          keptCount: snippets.length,
          urls: urls.slice(0, MAX_DIAGNOSTIC_URLS_PER_QUERY),
          reportChars: digest.length,
        },
      ],
    }
  } catch (err) {
    return emptyProviderResult(
      "gemini",
      diagnosticBase,
      err instanceof Error ? err.message : String(err),
    )
  }
}

async function fetchHostedProviderResearch(
  symbol: string,
  companyName: string | undefined,
  industry: string | undefined,
  now: number,
): Promise<{
  providers: ProviderResearchResult[]
  seenUrls: Set<string>
  diagnostics: SearchQueryDiagnostic[]
}> {
  const providers = enabledHostedSearchProviders()

  if (providers.length === 0) {
    return { providers: [], seenUrls: new Set(), diagnostics: [] }
  }

  const results = await Promise.all(
    providers.map((provider) => {
      switch (provider) {
        case "gemini":
          return fetchGeminiProviderResearch(
            symbol,
            companyName,
            industry,
            now,
          )
        case "openai":
          return fetchOpenAiProviderResearch(
            symbol,
            companyName,
            industry,
            now,
          )
        case "anthropic":
          return fetchAnthropicProviderResearch(
            symbol,
            companyName,
            industry,
            now,
          )
        case "xai":
          return fetchXaiProviderResearch(
            symbol,
            companyName,
            industry,
            now,
          )
      }
    })
  )

  const seenUrls = new Set<string>()

  for (const result of results) {
    for (const url of result.seenUrls) {
      seenUrls.add(normalizeSourceUrl(url))
    }
  }

  return {
    providers: results,
    seenUrls,
    diagnostics: results.flatMap((result) => result.diagnostics),
  }
}

/** Round 2: model-written follow-up queries on themes the round-1 reports surfaced, run via Exa search. */
async function runCatalystFollowUpPass(
  symbol: string,
  companyName: string | undefined,
  reports: string[],
  now: number,
): Promise<{
  queries: string[]
  snippets: SourceSnippet[]
  diagnostics: SearchQueryDiagnostic[]
}> {
  const model =
    process.env.CATALYST_FOLLOWUP_MODEL?.trim() || process.env.AI_GATEWAY_MODEL
  const maxQueries = getFollowUpMaxQueries()

  if (!model || maxQueries === 0 || reports.length === 0) {
    return { queries: [], snippets: [], diagnostics: [] }
  }

  let queries: string[] = []

  try {
    const result = await generateText({
      model,
      prompt: buildFollowUpQueryPrompt(
        symbol,
        companyName,
        reports,
        maxQueries,
        now,
      ),
    })

    queries = parseFollowUpQueries(result.text, maxQueries)
  } catch (err) {
    return {
      queries: [],
      snippets: [],
      diagnostics: [
        {
          bucket: "follow_up",
          query: `Follow-up query generation: ${symbol}`,
          resultCount: 0,
          keptCount: 0,
          urls: [],
          error: err instanceof Error ? err.message : String(err),
        },
      ],
    }
  }

  if (queries.length === 0) {
    return { queries: [], snippets: [], diagnostics: [] }
  }

  const searched = await runFollowUpSearches(queries, clipSnippetQuote)

  return {
    queries,
    snippets: searched.snippets,
    diagnostics: searched.diagnostics,
  }
}

async function enrichEvidenceWithDeepRead(
  evidenceSnippets: SourceSnippet[],
  urlHitCounts: Map<string, number>,
): Promise<{
  snippets: SourceSnippet[]
  deepReadUrlCount: number
  deepReadSuccessCount: number
  deepReadError?: string
}> {
  const rankedUrls = rankUrlsForDeepRead(
    evidenceSnippets,
    urlHitCounts,
    getDeepReadMaxUrls(),
  )

  if (rankedUrls.length === 0) {
    return {
      snippets: evidenceSnippets,
      deepReadUrlCount: 0,
      deepReadSuccessCount: 0,
    }
  }

  const deepRead = await fetchExaPageContents(rankedUrls, clipSnippetQuote)

  return {
    snippets: mergeDeepReadSnippets(evidenceSnippets, deepRead.snippets),
    deepReadUrlCount: deepRead.urlsAttempted,
    deepReadSuccessCount: deepRead.urlsSucceeded,
    deepReadError: deepRead.error,
  }
}

function buildFinnhubBaselineEvents(
  symbol: string,
  snippets: SourceSnippet[],
  calendarRows: FinnhubEarningsCalendarRow[],
): CatalystResearch["events"] {
  const calendarSnippet = snippets.find((snippet) =>
    snippet.url.includes("earnings-calendar"),
  )

  if (calendarRows.length > 0 && calendarSnippet) {
    return calendarRows.slice(0, 4).map((row) => {
      const quarterLabel =
        typeof row.quarter === "number" && typeof row.year === "number"
          ? `Q${row.quarter} ${row.year}`
          : "upcoming quarter"
      const hourLabel = row.hour ? ` (${row.hour})` : ""

      return {
        title: `${symbol} ${quarterLabel} earnings`,
        summary: `Finnhub earnings calendar lists ${symbol} reporting on ${row.date}${hourLabel}.`,
        whyItMatters:
          "Earnings can reset guidance, margins, and how the market prices the stock.",
        eventType: "earnings" as const,
        expectedDate: row.date,
        timingShape: "point" as const,
        datePrecision: "exact" as const,
        confidence: 0.85,
        status: "confirmed" as const,
        expectedImpact: "medium" as const,
        sources: [
          {
            url: calendarSnippet.url,
            title: calendarSnippet.title,
            publisher: calendarSnippet.publisher,
            quote: calendarSnippet.quote,
            supportsFields: ["eventType", "summary", "expectedDate"],
          },
        ],
      }
    })
  }

  return buildDeterministicEvents(symbol, snippets)
}

function mergeBaselineEarningsEvents(
  events: CatalystResearch["events"],
  baselineEvents: CatalystResearch["events"],
): CatalystResearch["events"] {
  if (baselineEvents.length === 0) {
    return events
  }

  const hasEarnings = events.some((event) => event.eventType === "earnings")

  if (hasEarnings) {
    return events
  }

  return [...events, ...baselineEvents]
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
      timingShape: "unknown",
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
  companyContext: string,
  providerReports: Array<{ provider: string; report: string }>,
  snippets: SourceSnippet[],
  now: number
): Promise<CatalystResearch | null> {
  const model = process.env.AI_GATEWAY_MODEL

  if (!model || (snippets.length === 0 && providerReports.length === 0)) {
    return null
  }

  const reportsBlock =
    providerReports.length > 0
      ? providerReports
          .map(
            (entry) =>
              `--- Report from ${entry.provider} search agent ---\n${entry.report}`,
          )
          .join("\n\n")
      : "(no provider reports available)"

  const prompt = [
    `Today is ${new Date(now).toISOString().slice(0, 10)}. Merge the research below into structured upcoming catalyst events for ${symbol} over the next 12 months.`,
    companyContext ? `Company context (not evidence; do not cite as a source): ${companyContext}` : "",
    "You are given (1) catalyst research reports written by independent web-search agents and (2) evidence snippets with verbatim page excerpts. The reports carry the synthesis and timing reasoning; the snippets carry verbatim quotes. Use both.",
    "Extract every distinct material catalyst the reports or snippets support: scheduled events (earnings, investor days, shareholder meetings, flagship and sell-side conferences) and qualitative or strategic milestones (regional regulatory rollouts and approvals, product unveils and launches, manufacturing or capacity ramps, named programs and sites, partnerships and strategic deals, lock-up or float/insider-supply milestones, management targets, legal decisions, clinical or data readouts, commercialization milestones).",
    formatResearchBreadthExtractionBlock(),
    "When sources describe the same dated or named real-world occasion (same flagship event, schedule, venue, or official page), output one merged event with the dominant eventType—put expected reveals in summary and whyItMatters instead of duplicate rows. Do not stitch conflicting share counts, percentages, or dates from different sources into one event; use separate rows or one lower-confidence row.",
    "Every event must cite at least one source whose URL appears in the reports or snippets. Never invent URLs. For each source quote: copy the snippet quote verbatim when a snippet with that URL exists; otherwise quote the specific report claim that the URL supports.",
    "Use timingShape on every event: point for exact dates; closed_window only when both start and end are source-backed; from when the catalyst has not started yet and begins after windowStart; by for deadlines; period with periodKey (YYYY, YYYY-Qn, YYYY-Hn, YYYY-MM) for fuzzy quarters/months/years; open for milestones already underway or open-ended without a stated end (may use past windowStart or periodKey when sources cite when they began); unknown when timing is unclear.",
    "Use expectedDate for timingShape point, windowStart/windowEnd for from/by/closed_window, and periodKey for period/open. Use datePrecision to show how specific the timing is. Never set windowEnd to the 12-month research cutoff or windowStart to today's date unless a source explicitly anchors timing to today — those are research scope, not event properties.",
    "Use status 'likely' or 'speculative' with lower confidence when timing is inferred from targets, cadence, or reporting; prefer primary company, regulator, SEC, or exchange sources over commentary.",
    "Exclude stale past events unless a source clearly supports a future recurrence or future milestone.",
    "summary: 1–2 short factual sentences (what/when/context); do not repeat the title or argue importance. whyItMatters: one short sentence on why the stock might move (guidance, multiple, regulatory binary, demand, dilution risk).",
    `Use null for unknown company, exchange, publication date, or event date fields. Return up to ${MAX_CATALYST_EVENTS} events, ordered chronologically when timing is known.`,
    "Research reports:",
    reportsBlock,
    "Evidence snippets:",
    JSON.stringify(snippets, null, 2),
  ].join("\n\n")

  const { output } = await generateText({
    model,
    output: Output.object({
      schema: catalystResearchAiSchema,
    }),
    prompt,
  })

  return normalizeCatalystResearchAi(output, now)
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
      warnHostedSearchAndGatewayEnvGaps()

      const researchStartedAt = Date.now()
      const tickerValidation = await validateTicker(ctx, run.symbol, researchStartedAt)
      assertTickerExists(tickerValidation)

      const finnhub = await fetchFinnhubMarketContext(run.symbol, researchStartedAt)
      const companyNameForSearch =
        finnhub.companyName ?? tickerValidation.companyName

      const companyContext = buildCompanyContextBlock(finnhub)
      const hostedResearch = await fetchHostedProviderResearch(
        run.symbol,
        companyNameForSearch,
        finnhub.finnhubIndustry,
        researchStartedAt,
      )
      const providerReports = hostedResearch.providers
        .filter((provider) => provider.report.length > 0)
        .map((provider) => ({
          provider: provider.provider,
          report: provider.report,
        }))

      const followUp = await runCatalystFollowUpPass(
        run.symbol,
        companyNameForSearch,
        providerReports.map((entry) => entry.report),
        researchStartedAt,
      )

      const merged = dedupeSnippetsByUrl(
        [
          ...hostedResearch.providers.flatMap((provider) => provider.snippets),
          ...followUp.snippets,
        ],
        MAX_WEB_SNIPPETS,
      )
      let evidenceSnippets = [...merged.snippets, ...finnhub.snippets]

      const seenUrls = new Set(hostedResearch.seenUrls)

      for (const snippet of followUp.snippets) {
        seenUrls.add(normalizeSourceUrl(snippet.url))
      }

      const deepRead = await enrichEvidenceWithDeepRead(
        evidenceSnippets,
        merged.urlHitCounts,
      )
      evidenceSnippets = deepRead.snippets

      const aiResearch = await buildAiEvents(
        run.symbol,
        companyContext,
        providerReports,
        evidenceSnippets,
        researchStartedAt
      )

      let rawEvents = aiResearch?.events ?? []

      if (rawEvents.length === 0) {
        rawEvents = buildDeterministicEvents(run.symbol, evidenceSnippets)
      }

      rawEvents = mergeBaselineEarningsEvents(rawEvents, finnhub.baselineEvents)
      const verified = verifyAndFilterEvents(
        rawEvents,
        evidenceSnippets,
        seenUrls,
      )
      const events = verified.events

      if (verified.droppedCount > 0) {
        console.warn(
          `[stonkseer-research] Citation verify dropped ${verified.droppedCount} event(s) for ${run.symbol}: ${verified.dropReasons.join("; ")}`,
        )
      }

      if (deepRead.deepReadError) {
        console.warn(
          `[stonkseer-research] Exa deep-read for ${run.symbol}: ${deepRead.deepReadError}`,
        )
      }

      await ctx.runMutation(
        internal.researchInternal.recordResearchDiagnostics,
        {
          runId: args.runId,
          symbol: run.symbol,
          searchQueryCount:
            hostedResearch.providers.length + followUp.queries.length,
          snippetCount: evidenceSnippets.length,
          extractionEventCount: events.length,
          deepReadUrlCount: deepRead.deepReadUrlCount,
          deepReadSuccessCount: deepRead.deepReadSuccessCount,
          citationDroppedCount: verified.droppedCount,
          followUpQueryCount: followUp.queries.length,
          reportDerivedSourceCount: verified.reportDerivedSourceCount,
          queries: [...hostedResearch.diagnostics, ...followUp.diagnostics],
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

      if (run.source === "refresh") {
        await ctx.runMutation(internal.researchInternal.syncPortfolioAfterRefresh, {
          runId: args.runId,
          symbol: run.symbol,
          now: Date.now(),
        })
      }
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
