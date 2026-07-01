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

const PRODUCTION_RAMP_TITLE_PATTERN =
  /\b(?:production|ramp|output|capacity|factory|plant|gigafactory|megafactory|deliveries|launch|start)\b/i

const CAPACITY_PATTERN =
  /\b(?:about|around|roughly|~)?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(gwh|mwh|vehicles?\s+per\s+week|units?\s+per\s+week|trucks?\s+per\s+year|vehicles?\s+per\s+year|units?\s+per\s+year)\b/gi

const MONTH_PATTERN =
  /\b(?:january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b/gi

const THREAD_TOKEN_STOPWORDS = new Set([
  "about",
  "annual",
  "approval",
  "battery",
  "bloc",
  "commercial",
  "company",
  "deliveries",
  "delivery",
  "energy",
  "factory",
  "giga",
  "gigafactory",
  "global",
  "launch",
  "market",
  "megafactory",
  "model",
  "plant",
  "production",
  "ramp",
  "regional",
  "report",
  "results",
  "scaling",
  "start",
  "system",
  "update",
  "vehicle",
  "vehicles",
  "volume",
  "weekly",
])

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

  for (const match of text.matchAll(/\bq([1-4])[^0-9]{1,24}(\d{4})\b/gi)) {
    keys.add(`${match[2]}-Q${match[1]}`)
  }

  return keys
}

function monthTokensIn(text: string): Set<string> {
  const tokens = new Set<string>()

  for (const match of text.matchAll(MONTH_PATTERN)) {
    tokens.add(match[0]!.slice(0, 3).toLowerCase())
  }

  return tokens
}

function hasTokenOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const token of a) {
    if (b.has(token)) {
      return true
    }
  }

  return false
}

function normalizedTokenList(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 3 && !THREAD_TOKEN_STOPWORDS.has(token))
  )
}

function normalizedTokens(text: string): Set<string> {
  return new Set(normalizedTokenList(text))
}

function titleThreadTokens(title: string): Set<string> {
  const tokens = normalizedTokenList(title)

  if (tokens.length >= 4) {
    return new Set(tokens.slice(2))
  }

  return new Set(tokens)
}

function normalizedCapacity(value: string, unit: string): string {
  const number = Number(value.replace(/,/g, ""))
  const normalizedUnit = unit.toLowerCase().replace(/\s+/g, " ").trim()

  return `${number}:${normalizedUnit}`
}

function capacityTokensIn(text: string): Set<string> {
  const tokens = new Set<string>()

  for (const match of text.matchAll(CAPACITY_PATTERN)) {
    tokens.add(normalizedCapacity(match[1]!, match[2]!))
  }

  return tokens
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

function hasEarningsQuarterMismatch(event: CatalystEvent): boolean {
  if (event.eventType !== "earnings" && !hasEarningsThread(event.title)) {
    return false
  }

  const titleQuarters = extractQuarterKeys(event.title)
  const bodyQuarters = extractQuarterKeys(combinedBodyText(event))

  if (titleQuarters.size === 0 || bodyQuarters.size === 0) {
    return false
  }

  return !hasTokenOverlap(titleQuarters, bodyQuarters)
}

function hasTitleTimingMismatch(event: CatalystEvent): boolean {
  if (!PRODUCTION_RAMP_TITLE_PATTERN.test(event.title)) {
    return false
  }

  const titleMonths = monthTokensIn(event.title)
  const summaryMonths = monthTokensIn(event.summary)

  if (titleMonths.size === 0 || summaryMonths.size === 0) {
    return false
  }

  return !hasTokenOverlap(titleMonths, summaryMonths)
}

function hasTitleCapacityMismatch(event: CatalystEvent): boolean {
  if (!PRODUCTION_RAMP_TITLE_PATTERN.test(event.title)) {
    return false
  }

  const titleCapacities = capacityTokensIn(event.title)
  const summaryCapacities = capacityTokensIn(event.summary)

  if (titleCapacities.size === 0 || summaryCapacities.size === 0) {
    return false
  }

  return !hasTokenOverlap(titleCapacities, summaryCapacities)
}

function hasTitleProgramAbsentFromBody(event: CatalystEvent): boolean {
  if (!PRODUCTION_RAMP_TITLE_PATTERN.test(event.title)) {
    return false
  }

  const titleTokens = titleThreadTokens(event.title)
  const bodyTokens = normalizedTokens(`${event.summary} ${event.whyItMatters}`)

  if (titleTokens.size === 0 || bodyTokens.size === 0) {
    return false
  }

  return !hasTokenOverlap(titleTokens, bodyTokens)
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

  if (hasEarningsQuarterMismatch(event)) {
    return `${eventLabel(event)}: earnings quarter conflicts with summary`
  }

  if (hasTitleTimingMismatch(event)) {
    return `${eventLabel(event)}: title timing conflicts with summary timing`
  }

  if (hasTitleCapacityMismatch(event)) {
    return `${eventLabel(event)}: title capacity conflicts with summary capacity`
  }

  if (hasTitleProgramAbsentFromBody(event)) {
    return `${eventLabel(event)}: title program is absent from summary and whyItMatters`
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
