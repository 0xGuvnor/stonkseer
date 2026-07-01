import type { CatalystResearch } from "./research-contract"
import { extractProceedingIds } from "./research-occasion-match"

type CatalystEvent = CatalystResearch["events"][number]

export type ThreadCoherenceFilterResult = {
  events: CatalystEvent[]
  droppedCount: number
  dropReasons: string[]
}

const VEHICLE_REPORT_TITLE_PATTERN =
  /\bq[1-4]\s+\d{4}\b(?=.*\b(?:vehicle|production|deliver(?:y|ies|ed)|deployment)\b)(?=.*\b(?:report|update|results?)\b)/i

const VEHICLE_REPORT_BODY_PATTERN =
  /\b(?:deliver(?:y|ies|ed)|production|produced|vehicles?|units?|deployment|consensus|storage deployment)\b/i

const EARNINGS_THREAD_PATTERN =
  /\b(?:earnings\s+(?:release|date|calendar|call|conference)|conference call|after market close|after market|wall street horizon|finnhub(?:'s)? earnings calendar|eps|free-cash-flow)\b/i

const AGENCY_TOKENS = [
  "nhtsa",
  "sec",
  "doj",
  "fda",
  "ftc",
  "epa",
  "eu",
  "ec",
  "rdw",
  "dmv",
  "california",
] as const

const PROCEEDING_TITLE_PATTERN =
  /\b(?:proceeding|investigation|probe|rulemaking|recall|permit|approval|authorization|compliance|scrutiny)\b/i

const PERMITTING_BODY_PATTERN =
  /\b(?:permit|permitting|deployment permit|commercial service|chauffeur|california|dmv|rdw|type approval)\b/i

function combinedBodyText(event: CatalystEvent): string {
  return [
    event.summary,
    event.whyItMatters,
    ...event.sources.map((source) => `${source.title} ${source.quote}`),
  ].join(" ")
}

function eventLabel(event: CatalystEvent): string {
  return event.title.trim() || "(untitled catalyst)"
}

function extractQuarterKeys(text: string): Set<string> {
  const keys = new Set<string>()

  for (const match of text.matchAll(/\bq([1-4])\s+(\d{4})\b/gi)) {
    keys.add(`${match[2]}-Q${match[1]}`)
  }

  return keys
}

function isVehicleReportTitle(title: string): boolean {
  return VEHICLE_REPORT_TITLE_PATTERN.test(title)
}

function hasVehicleReportBody(text: string): boolean {
  return VEHICLE_REPORT_BODY_PATTERN.test(text)
}

function hasEarningsThread(text: string): boolean {
  return EARNINGS_THREAD_PATTERN.test(text)
}

function hasVehicleReportEarningsMismatch(event: CatalystEvent): boolean {
  if (!isVehicleReportTitle(event.title)) {
    return false
  }

  return (
    hasEarningsThread(combinedBodyText(event)) &&
    !hasVehicleReportBody(event.summary)
  )
}

function hasVehicleReportQuarterMismatch(event: CatalystEvent): boolean {
  if (!isVehicleReportTitle(event.title)) {
    return false
  }

  const titleQuarters = extractQuarterKeys(event.title)
  const bodyQuarters = extractQuarterKeys(combinedBodyText(event))

  if (titleQuarters.size === 0 || bodyQuarters.size === 0) {
    return false
  }

  for (const quarter of titleQuarters) {
    if (bodyQuarters.has(quarter)) {
      return false
    }
  }

  return true
}

function agencyTokensIn(text: string): Set<string> {
  const normalized = text.toLowerCase()
  return new Set(
    AGENCY_TOKENS.filter((token) =>
      new RegExp(`\\b${token}\\b`, "i").test(normalized)
    )
  )
}

function hasSharedProceedingId(title: string, summary: string): boolean {
  const titleIds = extractProceedingIds(title)
  const summaryIds = extractProceedingIds(summary)

  for (const id of titleIds) {
    if (summaryIds.has(id)) {
      return true
    }
  }

  return false
}

function hasAgencyProceedingMismatch(event: CatalystEvent): boolean {
  if (!PROCEEDING_TITLE_PATTERN.test(event.title)) {
    return false
  }

  const titleAgencies = agencyTokensIn(event.title)

  if (
    titleAgencies.size === 0 &&
    extractProceedingIds(event.title).size === 0
  ) {
    return false
  }

  const summary = event.summary
  const summaryAgencies = agencyTokensIn(summary)
  const sharesAgency = [...titleAgencies].some((agency) =>
    summaryAgencies.has(agency)
  )

  if (sharesAgency || hasSharedProceedingId(event.title, summary)) {
    return false
  }

  return summaryAgencies.size > 0 || PERMITTING_BODY_PATTERN.test(summary)
}

function incoherenceReason(event: CatalystEvent): string | null {
  if (hasVehicleReportEarningsMismatch(event)) {
    return `${eventLabel(event)}: vehicle production/delivery report row uses earnings-calendar body text`
  }

  if (hasVehicleReportQuarterMismatch(event)) {
    return `${eventLabel(event)}: vehicle production/delivery report covered quarter conflicts with summary`
  }

  if (hasAgencyProceedingMismatch(event)) {
    return `${eventLabel(event)}: agency or proceeding in title is not the agency or proceeding described in summary`
  }

  return null
}

export function filterThreadCoherentCatalystEvents(
  events: CatalystEvent[]
): ThreadCoherenceFilterResult {
  const filtered: CatalystEvent[] = []
  const dropReasons: string[] = []

  for (const event of events) {
    const reason = incoherenceReason(event)

    if (reason) {
      dropReasons.push(reason)
      continue
    }

    filtered.push(event)
  }

  return {
    events: filtered,
    droppedCount: dropReasons.length,
    dropReasons,
  }
}
