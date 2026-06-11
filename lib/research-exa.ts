import type { SourceSnippet } from "./research-discovery"
import { compactWhitespace } from "./research-discovery"

const EXA_CONTENTS_URL = "https://api.exa.ai/contents"
const DEFAULT_DEEP_READ_MAX_URLS = 8
const DEFAULT_DEEP_READ_MAX_CHARACTERS = 8000

const exaContentsResponseSchema = {
  parse(data: unknown): { url: string; text: string }[] {
    if (!data || typeof data !== "object") {
      return []
    }

    const results = (data as { results?: unknown }).results

    if (!Array.isArray(results)) {
      return []
    }

    const parsed: { url: string; text: string }[] = []

    for (const row of results) {
      if (!row || typeof row !== "object") {
        continue
      }

      const url = (row as { url?: unknown }).url
      const text =
        (row as { text?: unknown }).text ??
        (row as { summary?: unknown }).summary

      if (typeof url !== "string" || typeof text !== "string") {
        continue
      }

      const trimmed = compactWhitespace(text)

      if (trimmed.length > 0) {
        parsed.push({ url, text: trimmed })
      }
    }

    return parsed
  },
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value)
    url.hash = ""

    return url.toString()
  } catch {
    return value
  }
}

function deepReadMaxUrls(): number {
  const value = Number(process.env.CATALYST_DEEP_READ_MAX_URLS)

  return Number.isInteger(value) && value > 0 ? value : DEFAULT_DEEP_READ_MAX_URLS
}

function deepReadMaxCharacters(): number {
  const value = Number(process.env.CATALYST_DEEP_READ_MAX_CHARACTERS)

  return Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_DEEP_READ_MAX_CHARACTERS
}

function isFinnhubDocUrl(url: string) {
  try {
    return new URL(url).hostname.includes("finnhub.io")
  } catch {
    return false
  }
}

function isXPostUrl(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase()

    return host === "x.com" || host === "twitter.com" || host.endsWith(".x.com")
  } catch {
    return false
  }
}

function quoteTokenSet(quote: string): Set<string> {
  return new Set(
    compactWhitespace(quote)
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 3),
  )
}

function quoteOverlapRatio(left: string, right: string): number {
  const leftTokens = quoteTokenSet(left)
  const rightTokens = quoteTokenSet(right)

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0
  }

  let intersection = 0

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection++
    }
  }

  return intersection / Math.min(leftTokens.size, rightTokens.size)
}

export function rankUrlsForDeepRead(
  snippets: SourceSnippet[],
  urlHitCounts: Map<string, number>,
  maxUrls: number,
): string[] {
  const snippetByUrl = new Map<string, SourceSnippet>()

  for (const snippet of snippets) {
    snippetByUrl.set(normalizeUrl(snippet.url), snippet)
  }

  const ranked = snippets
    .filter((snippet) => {
      if (isFinnhubDocUrl(snippet.url) || isXPostUrl(snippet.url)) {
        return false
      }

      return compactWhitespace(snippet.quote).length > 0
    })
    .map((snippet) => {
      const key = normalizeUrl(snippet.url)

      return {
        url: key,
        providerHits: urlHitCounts.get(key) ?? 1,
        quoteLength: compactWhitespace(snippet.quote).length,
        quote: compactWhitespace(snippet.quote),
      }
    })

  const seen = new Set<string>()
  const unique = ranked.filter((row) => {
    if (seen.has(row.url)) {
      return false
    }

    seen.add(row.url)

    return true
  })

  unique.sort(
    (a, b) =>
      b.providerHits - a.providerHits || b.quoteLength - a.quoteLength,
  )

  const selected: string[] = []

  for (const row of unique) {
    if (selected.length >= maxUrls) {
      break
    }

    const tooSimilar = selected.some((url) => {
      const otherQuote = snippetByUrl.get(url)?.quote ?? ""

      return quoteOverlapRatio(row.quote, otherQuote) > 0.55
    })

    if (!tooSimilar) {
      selected.push(row.url)
    }
  }

  for (const row of unique) {
    if (selected.length >= maxUrls) {
      break
    }

    if (!selected.includes(row.url)) {
      selected.push(row.url)
    }
  }

  return selected
}

export type ExaDeepReadResult = {
  urlsAttempted: number
  urlsSucceeded: number
  snippets: SourceSnippet[]
  error?: string
}

export async function fetchExaPageContents(
  urls: string[],
  clipQuote: (text: string) => string,
): Promise<ExaDeepReadResult> {
  if (urls.length === 0) {
    return { urlsAttempted: 0, urlsSucceeded: 0, snippets: [] }
  }

  const apiKey = process.env.EXA_API_KEY?.trim()

  if (!apiKey) {
    return {
      urlsAttempted: urls.length,
      urlsSucceeded: 0,
      snippets: [],
      error: "Missing EXA_API_KEY for Exa Contents deep-read",
    }
  }

  const maxCharacters = deepReadMaxCharacters()

  try {
    const response = await fetch(EXA_CONTENTS_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        urls,
        text: { maxCharacters },
      }),
    })

    if (!response.ok) {
      return {
        urlsAttempted: urls.length,
        urlsSucceeded: 0,
        snippets: [],
        error: `Exa Contents HTTP ${response.status}`,
      }
    }

    const json: unknown = await response.json()
    const rows = exaContentsResponseSchema.parse(json)
    const snippets: SourceSnippet[] = []

    for (const row of rows) {
      const normalizedUrl = normalizeUrl(row.url)

      let publisher = normalizedUrl

      try {
        publisher = new URL(normalizedUrl).hostname.replace(/^www\./, "")
      } catch {
        // keep fallback
      }

      snippets.push({
        url: normalizedUrl,
        title: publisher,
        publisher,
        quote: clipQuote(row.text),
        provenance: "page_fetch",
      })
    }

    return {
      urlsAttempted: urls.length,
      urlsSucceeded: snippets.length,
      snippets,
    }
  } catch (err) {
    return {
      urlsAttempted: urls.length,
      urlsSucceeded: 0,
      snippets: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export function mergeDeepReadSnippets(
  evidenceSnippets: SourceSnippet[],
  deepReadSnippets: SourceSnippet[],
): SourceSnippet[] {
  const byUrl = new Map<string, SourceSnippet>()

  for (const snippet of evidenceSnippets) {
    byUrl.set(normalizeUrl(snippet.url), snippet)
  }

  for (const snippet of deepReadSnippets) {
    const key = normalizeUrl(snippet.url)
    const existing = byUrl.get(key)

    byUrl.set(key, {
      url: key,
      title: existing?.title ?? snippet.title,
      publisher: existing?.publisher ?? snippet.publisher,
      quote: snippet.quote,
      publishedAt: existing?.publishedAt ?? snippet.publishedAt,
      provenance: "page_fetch",
    })
  }

  return [...byUrl.values()]
}

export function getDeepReadMaxUrls() {
  return deepReadMaxUrls()
}
