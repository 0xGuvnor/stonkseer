import type { CatalystResearch } from "./research-contract"
import type { SourceSnippet } from "./research-discovery"

function normalizeUrl(value: string) {
  try {
    const url = new URL(value)
    url.hash = ""

    return url.toString()
  } catch {
    return value
  }
}

export type CitationVerifyResult = {
  events: CatalystResearch["events"]
  droppedCount: number
  dropReasons: string[]
  repairedSourceCount: number
  reportDerivedSourceCount: number
}

/**
 * Provenance-aware citation verification:
 * - URL matches an evidence snippet: snap title/publisher/quote to the verbatim snippet.
 * - URL was seen by any search provider but has no excerpt: keep the model's
 *   source as-is, marked `report_derived`.
 * - URL nobody saw: drop the source. Drop the event only when zero sources survive.
 */
export function verifyAndFilterEvents(
  events: CatalystResearch["events"],
  evidenceSnippets: SourceSnippet[],
  seenUrls: Iterable<string> = [],
): CitationVerifyResult {
  const snippetByUrl = new Map<string, SourceSnippet>()

  for (const snippet of evidenceSnippets) {
    snippetByUrl.set(normalizeUrl(snippet.url), snippet)
  }

  const seenUrlSet = new Set<string>()

  for (const url of seenUrls) {
    seenUrlSet.add(normalizeUrl(url))
  }

  const kept: CatalystResearch["events"] = []
  const dropReasons: string[] = []
  let repairedSourceCount = 0
  let reportDerivedSourceCount = 0

  for (const event of events) {
    type VerifiedSource = CatalystResearch["events"][number]["sources"][number]

    const verifiedSources = event.sources.flatMap(
      (source): VerifiedSource[] => {
        const normalizedUrl = normalizeUrl(source.url)
        const snippet = snippetByUrl.get(normalizedUrl)

        if (snippet) {
          repairedSourceCount += 1

          return [
            {
              url: snippet.url,
              title: snippet.title,
              publisher: snippet.publisher,
              ...(source.publishedAt ?? snippet.publishedAt
                ? { publishedAt: source.publishedAt ?? snippet.publishedAt }
                : {}),
              quote: snippet.quote,
              supportsFields: source.supportsFields,
              provenance: "evidence_snippet",
            },
          ]
        }

        if (seenUrlSet.has(normalizedUrl)) {
          reportDerivedSourceCount += 1

          return [
            {
              ...source,
              url: normalizedUrl,
              provenance: "report_derived",
            },
          ]
        }

        return []
      },
    )

    if (verifiedSources.length === 0) {
      dropReasons.push(
        `Dropped "${event.title}": no source URL matched evidence snippets or provider-seen URLs`,
      )
      continue
    }

    kept.push({
      ...event,
      sources: verifiedSources,
    })
  }

  return {
    events: kept,
    droppedCount: events.length - kept.length,
    dropReasons,
    repairedSourceCount,
    reportDerivedSourceCount,
  }
}
