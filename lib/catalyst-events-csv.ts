import { formatExpectedImpact } from "@/lib/expected-impact-display"
import {
  eventTimingLabel,
  formatQuarterLabel,
  parseSortAnchor,
  quarterKeyFromDate,
} from "@/lib/research-results-utils"
import type { CatalystEventView } from "@/types/research-ui"

export const CATALYST_EVENTS_CSV_HEADERS = [
  "Quarter",
  "Timing",
  "Event",
  "Summary",
  "Why it matters",
  "Expected impact",
  "Sources",
] as const

export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function quarterCellLabel(
  event: CatalystEventView,
  previousEvent: CatalystEventView | undefined,
  now: number,
): string {
  const anchor = parseSortAnchor(event, now)
  const prevAnchor = previousEvent
    ? parseSortAnchor(previousEvent, now)
    : null
  const quarterKey = anchor ? quarterKeyFromDate(anchor) : "\0unknown"
  const prevQuarterKey = prevAnchor
    ? quarterKeyFromDate(prevAnchor)
    : "\0unknown"
  const showQuarterLabel = quarterKey !== prevQuarterKey

  if (!showQuarterLabel) {
    return ""
  }
  if (anchor) {
    return formatQuarterLabel(anchor)
  }
  return "—"
}

function formatSourcesCell(event: CatalystEventView): string {
  if (event.sources.length === 0) {
    return ""
  }
  return event.sources
    .map((source) => {
      const publisher = source.publisher.trim()
      if (publisher && publisher !== source.url) {
        return `${publisher} (${source.url})`
      }
      return source.url
    })
    .join("; ")
}

export function catalystEventsToCsv(
  events: CatalystEventView[],
  now: number = Date.now(),
): string {
  const rows = events.map((event, index) => {
    const previousEvent = index > 0 ? events[index - 1] : undefined
    const impact = formatExpectedImpact(event.expectedImpact)

    return [
      quarterCellLabel(event, previousEvent, now),
      eventTimingLabel(event, now),
      event.title,
      event.summary,
      event.whyItMatters,
      impact.label,
      formatSourcesCell(event),
    ].map(escapeCsvField)
  })

  return [
    CATALYST_EVENTS_CSV_HEADERS.map(escapeCsvField).join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n")
}
