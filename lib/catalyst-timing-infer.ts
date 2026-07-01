import {
  eventTimingLabel,
  normalizeCatalystEventTiming,
  normalizeTimingQualifier,
  parseAnchorDate,
  parseIsoPrefixToLocalDate,
  upgradeContradictoryTimingShape,
  type NormalizeCatalystTimingOptions,
} from "./catalyst-timing"
import type { CatalystResearch } from "./research-contract"
import type { DatePrecision } from "./research-contract"

export type InferredTiming = {
  timingShape: CatalystResearch["events"][number]["timingShape"]
  expectedDate?: string
  windowStart?: string
  windowEnd?: string
  periodKey?: string
  timingQualifier?: CatalystResearch["events"][number]["timingQualifier"]
  datePrecision: DatePrecision
  /** Higher = more specific / source-like anchor */
  specificity: number
}

const MONTH_NAME_TO_NUM: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
}

function quarterStartMonth(quarter: number): number {
  return (quarter - 1) * 3
}

function quarterEndMonth(quarter: number): number {
  return quarter * 3
}

function isoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function closedWindowFromQuarters(
  startQ: number,
  endQ: number,
  year: number,
): InferredTiming {
  const startMonth = quarterStartMonth(startQ) + 1
  const endMonth = quarterEndMonth(endQ)
  return {
    timingShape: "closed_window",
    windowStart: isoDate(year, startMonth, 1),
    windowEnd: isoDate(year, endMonth, lastDayOfMonth(year, endMonth)),
    datePrecision: "quarter",
    specificity: 80,
  }
}

function inferFromTextSegment(text: string): InferredTiming | null {
  const normalized = text.replace(/\u2013|\u2014/g, "-")

  const quarterRange = /\bQ([1-4])\s*-\s*Q([1-4])\s+(\d{4})\b/i.exec(
    normalized,
  )
  if (quarterRange) {
    const startQ = Number(quarterRange[1])
    const endQ = Number(quarterRange[2])
    const year = Number(quarterRange[3])
    if (startQ <= endQ) {
      return closedWindowFromQuarters(startQ, endQ, year)
    }
  }

  const halfYear = /\bH([12])\s+(\d{4})\b/i.exec(normalized)
  if (halfYear) {
    const half = Number(halfYear[1])
    const year = Number(halfYear[2])
    return {
      timingShape: "period",
      periodKey: `${year}-H${half}`,
      datePrecision: "half",
      specificity: 70,
    }
  }

  const monthListBeforeYear =
    /\b([A-Za-z]+)\s+(?:and|or|\/|,)\s+([A-Za-z]+)\s+(\d{4})\b/i.exec(
      normalized,
    )
  if (monthListBeforeYear) {
    const monthNum = MONTH_NAME_TO_NUM[monthListBeforeYear[1]!.toLowerCase()]
    const year = Number(monthListBeforeYear[3])
    if (monthNum) {
      return {
        timingShape: "period",
        periodKey: isoMonth(year, monthNum),
        datePrecision: "month",
        specificity: 62,
      }
    }
  }

  const monthWithQualifier =
    /\b(early|mid|late)\s+([A-Za-z]+)\s+(\d{4})\b/i.exec(normalized)
  if (monthWithQualifier) {
    const monthNum = MONTH_NAME_TO_NUM[monthWithQualifier[2]!.toLowerCase()]
    const year = Number(monthWithQualifier[3])
    const qualifier = normalizeTimingQualifier(monthWithQualifier[1])
    if (monthNum) {
      return {
        timingShape: "period",
        periodKey: isoMonth(year, monthNum),
        ...(qualifier ? { timingQualifier: qualifier } : {}),
        datePrecision: "month",
        specificity: 65,
      }
    }
  }

  const singleQuarter = /\bQ([1-4])\s+(\d{4})\b/i.exec(normalized)
  if (singleQuarter) {
    const quarter = Number(singleQuarter[1])
    const year = Number(singleQuarter[2])
    return {
      timingShape: "period",
      periodKey: `${year}-Q${quarter}`,
      datePrecision: "quarter",
      specificity: 65,
    }
  }

  const monthYear = /\b([A-Za-z]+)\s+(\d{4})\b/i.exec(normalized)
  if (monthYear) {
    const monthNum = MONTH_NAME_TO_NUM[monthYear[1]!.toLowerCase()]
    const year = Number(monthYear[2])
    if (monthNum) {
      return {
        timingShape: "period",
        periodKey: isoMonth(year, monthNum),
        datePrecision: "month",
        specificity: 60,
      }
    }
  }

  const isoDateMatch = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(normalized)
  if (isoDateMatch) {
    const year = Number(isoDateMatch[1])
    const month = Number(isoDateMatch[2])
    const day = Number(isoDateMatch[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return {
        timingShape: "point",
        expectedDate: isoDate(year, month, day),
        datePrecision: "exact",
        specificity: 90,
      }
    }
  }

  const yearOnly = /\b(?:in|during|by|before|after)\s+(\d{4})\b/i.exec(
    normalized,
  )
  if (yearOnly) {
    const year = Number(yearOnly[1])
    return {
      timingShape: "period",
      periodKey: String(year),
      datePrecision: "unknown",
      specificity: 20,
    }
  }

  return null
}

export function inferTimingFromEventText(text: string): InferredTiming | null {
  if (!text.trim()) {
    return null
  }

  return inferFromTextSegment(text)
}

function collectEventTextSegments(
  event: CatalystResearch["events"][number],
): Array<{ text: string; weight: number }> {
  const segments: Array<{ text: string; weight: number }> = [
    { text: event.title, weight: 50 },
    { text: event.summary, weight: 40 },
    { text: event.whyItMatters, weight: 30 },
  ]

  for (const source of event.sources) {
    segments.push({ text: source.quote, weight: 70 })
  }

  return segments.filter((segment) => segment.text.trim().length > 0)
}

function pickBestInferredTiming(
  event: CatalystResearch["events"][number],
): InferredTiming | null {
  let best: InferredTiming | null = null

  for (const segment of collectEventTextSegments(event)) {
    const inferred = inferTimingFromEventText(segment.text)
    if (!inferred) {
      continue
    }

    const score = inferred.specificity + segment.weight
    const bestScore = best ? best.specificity + 50 : -1

    if (score > bestScore) {
      best = { ...inferred, specificity: score }
    }
  }

  return best
}

function isoDatePrefixFromRaw(raw: string | undefined): string | null {
  if (!raw?.trim()) {
    return null
  }

  const directPrefix = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim())?.[1]
  if (directPrefix) {
    return directPrefix
  }

  const parsed = Date.parse(raw)
  if (Number.isNaN(parsed)) {
    return null
  }

  return new Date(parsed).toISOString().slice(0, 10)
}

function sourcePublishedDatePrefixes(
  event: CatalystResearch["events"][number],
): Set<string> {
  const prefixes = new Set<string>()

  for (const source of event.sources) {
    const prefix = isoDatePrefixFromRaw(source.publishedAt)
    if (prefix) {
      prefixes.add(prefix)
    }
  }

  return prefixes
}

function isLikelySourcePublicationDateLeak(
  event: CatalystResearch["events"][number],
): boolean {
  if (event.timingShape !== "point" || !event.expectedDate) {
    return false
  }

  const expectedDate = isoDatePrefixFromRaw(event.expectedDate)
  return expectedDate ? sourcePublishedDatePrefixes(event).has(expectedDate) : false
}

function isSamePointDate(
  event: CatalystResearch["events"][number],
  inferred: InferredTiming,
): boolean {
  if (inferred.timingShape !== "point") {
    return false
  }

  return (
    isoDatePrefixFromRaw(event.expectedDate) ===
    isoDatePrefixFromRaw(inferred.expectedDate)
  )
}

function isFutureInferredTiming(
  inferred: InferredTiming,
  researchRunDate: string,
): boolean {
  const anchor = parseAnchorDate(inferred)
  const runDate = parseIsoPrefixToLocalDate(researchRunDate)

  if (!anchor || !runDate) {
    return false
  }

  return anchor.getTime() > runDate.getTime()
}

export function hasDisplayableTiming(
  event: CatalystResearch["events"][number],
  now: number = Date.now(),
): boolean {
  return eventTimingLabel(event, now) !== "Timing unknown"
}

export function needsTimingRepair(
  event: CatalystResearch["events"][number],
  now: number = Date.now(),
): boolean {
  if (hasDisplayableTiming(event, now)) {
    if (event.timingShape === "closed_window") {
      return !event.windowStart || !event.windowEnd
    }
    if (event.timingShape === "period") {
      return !event.periodKey
    }
    if (event.timingShape === "point") {
      return !event.expectedDate
    }
    if (event.timingShape === "from") {
      return !event.windowStart
    }
    if (event.timingShape === "by") {
      return !event.windowEnd
    }
    return false
  }

  return true
}

function applyInferredTiming(
  event: CatalystResearch["events"][number],
  inferred: InferredTiming,
): CatalystResearch["events"][number] {
  const base = {
    ...event,
    timingShape: inferred.timingShape,
    datePrecision: inferred.datePrecision,
    confidence: Math.min(event.confidence, 0.75),
    status:
      event.status === "confirmed"
        ? ("likely" as const)
        : event.status,
  }

  switch (inferred.timingShape) {
    case "point":
      return {
        ...base,
        expectedDate: inferred.expectedDate,
        windowStart: undefined,
        windowEnd: undefined,
        periodKey: undefined,
      }
    case "closed_window":
      return {
        ...base,
        windowStart: inferred.windowStart,
        windowEnd: inferred.windowEnd,
        expectedDate: undefined,
        periodKey: undefined,
      }
    case "from":
      return {
        ...base,
        windowStart: inferred.windowStart,
        expectedDate: undefined,
        windowEnd: undefined,
        periodKey: undefined,
      }
    case "by":
      return {
        ...base,
        windowEnd: inferred.windowEnd,
        expectedDate: undefined,
        windowStart: undefined,
        periodKey: undefined,
      }
    case "period":
      return {
        ...base,
        periodKey: inferred.periodKey,
        timingQualifier: inferred.timingQualifier,
        expectedDate: undefined,
        windowStart: undefined,
        windowEnd: undefined,
      }
    case "open":
      return {
        ...base,
        ...(inferred.windowStart ? { windowStart: inferred.windowStart } : {}),
        ...(inferred.periodKey ? { periodKey: inferred.periodKey } : {}),
        expectedDate: undefined,
      }
    case "unknown":
      return base
    default: {
      const _exhaustive: never = inferred.timingShape
      return _exhaustive
    }
  }
}

export function repairCatalystEventTiming(
  event: CatalystResearch["events"][number],
  options: NormalizeCatalystTimingOptions,
  now: number = Date.now(),
): CatalystResearch["events"][number] {
  let working = upgradeContradictoryTimingShape(event)

  if (isLikelySourcePublicationDateLeak(working)) {
    const inferred = pickBestInferredTiming(working)
    if (
      inferred &&
      !isSamePointDate(working, inferred) &&
      isFutureInferredTiming(inferred, options.researchRunDate)
    ) {
      working = applyInferredTiming(working, inferred)
    }
  }

  if (needsTimingRepair(working, now)) {
    const inferred = pickBestInferredTiming(working)
    if (inferred) {
      working = applyInferredTiming(working, inferred)
    }
  }

  if (
    working.timingShape === "closed_window" &&
    (!working.windowStart || !working.windowEnd)
  ) {
    const inferred = pickBestInferredTiming(working)
    if (inferred?.timingShape === "closed_window") {
      working = applyInferredTiming(working, inferred)
    }
  }

  return normalizeCatalystEventTiming(working, options)
}
