export type SearchQueryDiagnostic = {
  bucket: string
  query: string
  includeDomains?: string[]
  maxResults?: number
  resultCount: number
  keptCount: number
  urls: string[]
  error?: string
  reportChars?: number
}

export type SnippetProvenance =
  | "tool_excerpt"
  | "page_fetch"
  | "finnhub_metadata"
  | "follow_up_search"

export type SourceSnippet = {
  url: string
  title: string
  publisher: string
  quote: string
  publishedAt?: string
  provenance?: SnippetProvenance
}

export function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

/** Returns merged tool excerpts only; never synthesizes quotes from a model digest. */
export function excerptOnlyQuote(
  excerpts: string[] | undefined,
  maxLen = 2500,
): string | null {
  const unique = Array.from(
    new Set(
      (excerpts ?? [])
        .map(compactWhitespace)
        .filter((value) => value.length > 0),
    ),
  )

  if (unique.length === 0) {
    return null
  }

  const merged = unique.join(" ")

  if (merged.length <= maxLen) {
    return merged
  }

  return `${merged.slice(0, maxLen - 1).trimEnd()}…`
}

function snippetHostname(snippet: SourceSnippet): string {
  try {
    return new URL(snippet.url).hostname.replace(/^www\./, "")
  } catch {
    return snippet.publisher.replace(/^www\./, "")
  }
}

/** Prefer breadth of publishers when we have more URLs than the model budget. */
export function diversifySnippetsByDomain(
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
