import { z } from "zod"

import type { SearchQueryDiagnostic, SourceSnippet } from "./research-discovery"
import { compactWhitespace } from "./research-discovery"

const EXA_SEARCH_URL = "https://api.exa.ai/search"
const DEFAULT_FOLLOWUP_MAX_QUERIES = 6
const DEFAULT_FOLLOWUP_RESULTS_PER_QUERY = 5
const MIN_FOLLOWUP_QUERY_CHARS = 8
const MAX_FOLLOWUP_QUERY_CHARS = 200

const exaSearchResponseSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            url: z.string(),
            title: z.string().nullish(),
            text: z.string().nullish(),
            summary: z.string().nullish(),
            publishedDate: z.string().nullish(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough()

export function getFollowUpMaxQueries(): number {
  const value = Number(process.env.CATALYST_FOLLOWUP_MAX_QUERIES)

  return Number.isInteger(value) && value >= 0 && value <= 12
    ? value
    : DEFAULT_FOLLOWUP_MAX_QUERIES
}

export function buildFollowUpQueryPrompt(
  symbol: string,
  companyName: string | undefined,
  reports: string[],
  maxQueries: number,
  now: number,
): string {
  const today = new Date(now).toISOString().slice(0, 10)
  const companyLabel = companyName ? `${companyName} (${symbol})` : symbol

  return [
    `Today is ${today}. Below are research reports about upcoming stock catalysts for ${companyLabel}, written by independent search agents.`,
    "Identify the named programs, products, projects, factories or sites, regulatory processes, and milestones that look material to the stock but lack specific timing, official confirmation, or strong sourcing in the reports.",
    "When reports mention quarterly vehicle production/delivery reports or similar operational disclosures by quarter but without an expected release month or window, include targeted queries to surface when those reports are typically published.",
    `Write up to ${maxQueries} short web search queries that would surface dates, official confirmations, or recent credible reporting for those themes. Derive every query strictly from the report content; do not use generic templates or themes the reports never mention.`,
    "Return one query per line with no numbering, bullets, quotes, or commentary. If the reports already cover everything with solid timing and sources, return fewer queries or none.",
    "Research reports:",
    ...reports,
  ].join("\n\n")
}

/** Parses model output into clean follow-up queries: strips bullets/numbering/quotes, drops headers, dedupes, caps. */
export function parseFollowUpQueries(
  raw: string,
  maxQueries: number,
): string[] {
  const seen = new Set<string>()
  const queries: string[] = []

  for (const line of raw.split(/\r?\n/)) {
    const query = compactWhitespace(
      compactWhitespace(line)
        .replace(/^[-*•·]+\s*/, "")
        .replace(/^\d+[.):]\s*/, "")
        .replace(/^["'`]+/, "")
        .replace(/["'`]+$/, ""),
    )

    if (
      query.length < MIN_FOLLOWUP_QUERY_CHARS ||
      query.length > MAX_FOLLOWUP_QUERY_CHARS ||
      query.endsWith(":")
    ) {
      continue
    }

    const key = query.toLowerCase()

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    queries.push(query)

    if (queries.length >= maxQueries) {
      break
    }
  }

  return queries
}

export type FollowUpSearchResult = {
  snippets: SourceSnippet[]
  diagnostics: SearchQueryDiagnostic[]
}

async function runSingleExaSearch(
  query: string,
  apiKey: string,
  clipQuote: (text: string) => string,
): Promise<{ snippets: SourceSnippet[]; diagnostic: SearchQueryDiagnostic }> {
  const diagnosticBase: SearchQueryDiagnostic = {
    bucket: "follow_up",
    query,
    maxResults: DEFAULT_FOLLOWUP_RESULTS_PER_QUERY,
    resultCount: 0,
    keptCount: 0,
    urls: [],
  }

  try {
    const response = await fetch(EXA_SEARCH_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults: DEFAULT_FOLLOWUP_RESULTS_PER_QUERY,
        contents: {
          text: { maxCharacters: 2500 },
          livecrawl: "fallback",
        },
      }),
    })

    if (!response.ok) {
      return {
        snippets: [],
        diagnostic: {
          ...diagnosticBase,
          error: `Exa search HTTP ${response.status}`,
        },
      }
    }

    const json: unknown = await response.json()
    const parsed = exaSearchResponseSchema.safeParse(json)

    if (!parsed.success) {
      return {
        snippets: [],
        diagnostic: {
          ...diagnosticBase,
          error: "Exa search response did not match expected shape",
        },
      }
    }

    const rows = parsed.data.results ?? []
    const snippets: SourceSnippet[] = []
    const urls: string[] = []

    for (const row of rows) {
      const text = compactWhitespace(row.text ?? row.summary ?? "")

      if (!text) {
        continue
      }

      let publisher: string

      try {
        publisher = new URL(row.url).hostname.replace(/^www\./, "")
      } catch {
        continue
      }

      urls.push(row.url)
      snippets.push({
        url: row.url,
        title:
          row.title && compactWhitespace(row.title).length > 0
            ? compactWhitespace(row.title)
            : publisher,
        publisher,
        quote: clipQuote(text),
        ...(row.publishedDate ? { publishedAt: row.publishedDate } : {}),
        provenance: "follow_up_search",
      })
    }

    return {
      snippets,
      diagnostic: {
        ...diagnosticBase,
        resultCount: rows.length,
        keptCount: snippets.length,
        urls: urls.slice(0, 6),
      },
    }
  } catch (err) {
    return {
      snippets: [],
      diagnostic: {
        ...diagnosticBase,
        error: err instanceof Error ? err.message : String(err),
      },
    }
  }
}

export async function runFollowUpSearches(
  queries: string[],
  clipQuote: (text: string) => string,
): Promise<FollowUpSearchResult> {
  if (queries.length === 0) {
    return { snippets: [], diagnostics: [] }
  }

  const apiKey = process.env.EXA_API_KEY?.trim()

  if (!apiKey) {
    return {
      snippets: [],
      diagnostics: queries.map((query) => ({
        bucket: "follow_up",
        query,
        resultCount: 0,
        keptCount: 0,
        urls: [],
        error: "Missing EXA_API_KEY for follow-up Exa search",
      })),
    }
  }

  const results = await Promise.all(
    queries.map((query) => runSingleExaSearch(query, apiKey, clipQuote)),
  )

  return {
    snippets: results.flatMap((result) => result.snippets),
    diagnostics: results.map((result) => result.diagnostic),
  }
}
