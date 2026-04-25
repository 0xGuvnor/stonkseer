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
const MAX_WEB_SNIPPETS = 28
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

type TavilyTopic = "finance" | "general"

type SearchQuery = {
  query: string
  includeDomains?: string[]
  maxResults?: number
  /** Tavily topic; default finance when omitted. */
  topic?: TavilyTopic
}

type SourceSnippet = {
  url: string
  title: string
  publisher: string
  quote: string
  publishedAt?: string
}

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

function cleanCompanyName(companyName?: string) {
  return companyName
    ?.replace(
      /\b(incorporated|inc\.?|corporation|corp\.?|limited|ltd\.?|plc|holdings?|class [a-z]|common stock|ordinary shares)\b/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim()
}

function hostnameFromUrl(value?: string) {
  if (!value) {
    return undefined
  }

  try {
    return new URL(value).hostname.replace(/^www\./, "")
  } catch {
    return undefined
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

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function snippetHostname(snippet: SourceSnippet): string {
  try {
    return new URL(snippet.url).hostname.replace(/^www\./, "")
  } catch {
    return snippet.publisher.replace(/^www\./, "")
  }
}

/** Prefer breadth of publishers when we have more URLs than the model budget. */
function diversifySnippetsByDomain(
  snippets: SourceSnippet[],
  max: number,
): SourceSnippet[] {
  if (snippets.length <= max) {
    return snippets
  }

  const byHost = new Map<string, SourceSnippet[]>()
  const hostOrder: string[] = []

  for (const snippet of snippets) {
    const host = snippetHostname(snippet)
    if (!byHost.has(host)) {
      hostOrder.push(host)
      byHost.set(host, [])
    }
    byHost.get(host)!.push(snippet)
  }

  const result: SourceSnippet[] = []
  while (result.length < max) {
    let progressed = false
    for (const host of hostOrder) {
      const bucket = byHost.get(host)
      if (bucket && bucket.length > 0) {
        const next = bucket.shift()
        if (next) {
          result.push(next)
          progressed = true
          if (result.length >= max) {
            break
          }
        }
      }
    }
    if (!progressed) {
      break
    }
  }

  return result
}

function industryTailQueries(
  companyLabel: string,
  yearWindow: string,
  industry?: string,
): SearchQuery[] {
  const i = industry?.toLowerCase() ?? ""
  const out: SearchQuery[] = []

  if (/(bio|pharma|health|drug|medical|therap|genetic|clinical|diagnostic)/.test(i)) {
    out.push({
      query: `${companyLabel} FDA PDUFA advisory committee clinical trial readout topline data ${yearWindow}`,
      maxResults: 6,
      topic: "general",
    })
  }

  if (/(software|technology|semi|internet|hardware|cloud|saas|it services)/.test(i)) {
    out.push({
      query: `${companyLabel} developer conference platform roadmap enterprise customer momentum ${yearWindow}`,
      maxResults: 5,
      topic: "general",
    })
  }

  if (/(bank|financial|insurance|capital|credit|reit|asset management)/.test(i)) {
    out.push({
      query: `${companyLabel} investor conference banking forum CCAR stress test financial forum ${yearWindow}`,
      maxResults: 5,
      topic: "finance",
    })
  }

  if (/(energy|oil|gas|solar|mining|utility|power)/.test(i)) {
    out.push({
      query: `${companyLabel} production guidance capacity project commissioning FID sanction ${yearWindow}`,
      maxResults: 5,
      topic: "general",
    })
  }

  return out
}

function recurringEventDiscoveryQueries(
  companyLabel: string,
  officialDomain: string | undefined,
  yearWindow: string,
): SearchQuery[] {
  const officialDomains = officialDomain ? [officialDomain] : undefined

  return [
    {
      query: `${companyLabel} annual developer conference keynote product announcements ${yearWindow}`,
      includeDomains: officialDomains,
      maxResults: 8,
      topic: "general",
    },
    {
      query: `${companyLabel} annual customer conference user conference summit keynote product announcements ${yearWindow}`,
      includeDomains: officialDomains,
      maxResults: 8,
      topic: "general",
    },
    {
      query: `${companyLabel} official event keynote product launch announcements ${yearWindow}`,
      includeDomains: officialDomains,
      maxResults: 8,
      topic: "general",
    },
    {
      query: `${companyLabel} recurring annual event conference keynote launch roadmap ${yearWindow}`,
      maxResults: 8,
      topic: "general",
    },
  ]
}

function buildSearchQueries(
  symbol: string,
  companyName: string | undefined,
  companyWebsite: string | undefined,
  now: number,
  industry?: string,
): SearchQuery[] {
  const currentYear = new Date(now).getUTCFullYear()
  const nextYear = currentYear + 1
  const shortCompanyName = cleanCompanyName(companyName)
  const companyLabel = shortCompanyName
    ? `${shortCompanyName} ${symbol}`
    : symbol
  const officialDomain = hostnameFromUrl(companyWebsite)
  const yearWindow = `${currentYear} ${nextYear}`
  const queries: SearchQuery[] = [
    {
      query: `${companyLabel} upcoming catalysts milestones next 12 months ${yearWindow}`,
      maxResults: 6,
    },
    {
      query: `${companyLabel} investor relations calendar annual meeting shareholder meeting earnings call investor day ${yearWindow}`,
      maxResults: 6,
    },
    {
      query: `${companyLabel} corporate presentation conference webcast fireside chat speaking slot investor conference ${yearWindow}`,
      maxResults: 6,
      topic: "general",
    },
    {
      query: `${companyLabel} trade show user conference summit keynote booth exhibition ${yearWindow}`,
      maxResults: 5,
      topic: "general",
    },
    {
      query: `${companyLabel} strategic partnership collaboration joint venture OEM supply agreement customer win ${yearWindow}`,
      maxResults: 5,
      topic: "general",
    },
    {
      query: `${companyLabel} Form 8-K material definitive agreement press release exhibit future ${yearWindow}`,
      includeDomains: ["sec.gov"],
      maxResults: 6,
      topic: "general",
    },
    {
      query: `${companyLabel} ${symbol} merger acquisition spin-off restructuring shareholder vote proxy ${yearWindow}`,
      includeDomains: ["sec.gov"],
      maxResults: 5,
      topic: "general",
    },
    {
      query: `${companyLabel} product roadmap launch production ramp capacity expansion commercialization ${yearWindow}`,
      maxResults: 6,
    },
    {
      query: `${companyLabel} regulatory approval rollout geographic expansion legal decision trial data ${yearWindow}`,
      maxResults: 6,
    },
    {
      query: `${companyLabel} management guidance capex targets production deliveries milestones ${yearWindow}`,
      maxResults: 6,
    },
    {
      query: `${companyLabel} SEC 10-K 10-Q earnings transcript future plans milestones ${yearWindow}`,
      maxResults: 5,
    },
    {
      query: `${companyLabel} analyst day investor presentation roadmap ${yearWindow}`,
      maxResults: 5,
    },
    {
      query: `${companyLabel} news upcoming event milestone catalyst ${yearWindow}`,
      maxResults: 5,
    },
  ]

  if (officialDomain) {
    queries.unshift(
      {
        query: `${companyLabel} official investor relations events calendar milestones ${yearWindow}`,
        includeDomains: [officialDomain],
        maxResults: 5,
      },
      {
        query: `${companyLabel} official newsroom product launch production regulatory update ${yearWindow}`,
        includeDomains: [officialDomain],
        maxResults: 5,
      },
    )
  }

  return [
    ...recurringEventDiscoveryQueries(companyLabel, officialDomain, yearWindow),
    ...queries,
    ...industryTailQueries(companyLabel, yearWindow, industry),
    {
      query: `${symbol} $${symbol} upcoming catalysts next 12 months ${yearWindow}`,
      maxResults: 4,
    },
  ]
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
  maxQueries: number,
  queryPlan?: SearchQuery[],
): Promise<SourceSnippet[]> {
  const apiKey = process.env.TAVILY_API_KEY

  if (!apiKey) {
    return []
  }

  const snippets: SourceSnippet[] = []
  const seenUrls = new Set<string>()

  const plan =
    queryPlan ??
    buildSearchQueries(symbol, companyName, companyWebsite, now, undefined)

  for (const searchQuery of plan.slice(0, maxQueries)) {
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
      console.warn("[tavily] json_parse_error", {
        symbol,
        message: err instanceof Error ? err.message : String(err),
        queryPreview: searchQuery.query.slice(0, 120),
      })
      continue
    }

    const parsed = tavilySearchSchema.safeParse(json)

    if (!parsed.success) {
      console.warn("[tavily] schema_mismatch", {
        symbol,
        queryPreview: searchQuery.query.slice(0, 120),
        issues: parsed.error.issues.slice(0, 8),
      })
      continue
    }

    for (const result of parsed.data.results ?? []) {
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
      snippets.push({
        url: normalizedUrl,
        title: result.title,
        publisher,
        publishedAt: result.published_date ?? undefined,
        quote: quote.slice(0, WEB_SNIPPET_QUOTE_LENGTH),
      })
    }
  }

  return diversifySnippetsByDomain(snippets, MAX_WEB_SNIPPETS)
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
      "Classify eventType using: earnings, product, regulatory, launch, investor_day, conference (trade shows, keynote slots, sell-side conferences, webcast-only conference tracks), partnership (JVs, OEM, major customer or collaboration deals), corporate (M&A, spin-offs, reorgs, financings, proxy votes), macro, legal, other.",
      "Roadmap or target milestones are allowed when supported by company statements, filings, transcripts, regulator pages, exchange calendars, or credible reporting. Use status 'likely' or 'speculative' and lower confidence when timing is inferred from a target, cadence, or historical calendar pattern.",
      "Do not require exact dates. Use expectedDate for exact dates, windowStart/windowEnd for month/quarter/season/year-end windows, and datePrecision to show how specific the timing is.",
      "Exclude stale past events unless a source clearly supports a future recurrence or future milestone.",
      "Return up to 12 highest-impact events, ordered chronologically when timing is known.",
      "Prefer confirmed company, exchange, regulator, SEC, or investor relations sources over commentary.",
      "Use null for unknown company, exchange, publication date, or event date fields.",
      "Copy source url, title, publisher, publishedAt, and quote from the snippets instead of paraphrasing source metadata.",
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
      const webSearchQueryLimit =
        run.source === "anonymous"
          ? Math.min(5, webSearchPlan.length)
          : webSearchPlan.length

      const webSnippets = await fetchWebSearchSnippets(
        run.symbol,
        companyNameForSearch,
        finnhub.companyWebsite,
        researchStartedAt,
        webSearchQueryLimit,
        webSearchPlan,
      )
      const snippets = [...finnhub.snippets, ...webSnippets]
      const aiResearch = await buildAiEvents(
        run.symbol,
        snippets,
        researchStartedAt,
      )
      const events =
        aiResearch?.events ?? buildDeterministicEvents(run.symbol, snippets)

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
