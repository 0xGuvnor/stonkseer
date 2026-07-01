import type { CatalystResearch } from "./research-contract"

export const RESEARCH_HORIZON_MS = 365 * 24 * 60 * 60 * 1000

export const TIMING_SHAPES = [
  "point",
  "closed_window",
  "from",
  "by",
  "period",
  "open",
  "unknown",
] as const

export type TimingShape = (typeof TIMING_SHAPES)[number]

export const TIMING_QUALIFIER_VALUES = ["early", "mid", "late"] as const

export type TimingQualifier = (typeof TIMING_QUALIFIER_VALUES)[number]

/** Maps model synonyms onto coarse intra-period placement (early/mid/late). */
export function normalizeTimingQualifier(
  value: unknown,
): TimingQualifier | undefined {
  if (typeof value !== "string") {
    return undefined
  }

  const normalized = value.trim().toLowerCase()

  if (normalized === "middle") {
    return "mid"
  }

  if ((TIMING_QUALIFIER_VALUES as readonly string[]).includes(normalized)) {
    return normalized as TimingQualifier
  }

  return undefined
}

export type CatalystTimingFields = {
  timingShape: TimingShape
  expectedDate?: string
  windowStart?: string
  windowEnd?: string
  periodKey?: string
  timingQualifier?: TimingQualifier
  datePrecision: string
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

const FULL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

const MONTH_ONLY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

const PERIOD_KEY_PATTERN =
  /^(\d{4})(?:-(Q[1-4]|H[12]|(?:0[1-9]|1[0-2])))?$/

function ordinalSuffix(day: number): string {
  const mod10 = day % 10
  const mod100 = day % 100
  if (mod100 >= 11 && mod100 <= 13) {
    return "th"
  }
  if (mod10 === 1) {
    return "st"
  }
  if (mod10 === 2) {
    return "nd"
  }
  if (mod10 === 3) {
    return "rd"
  }
  return "th"
}

function parseIsoDateParts(raw: string): { year: number; month: number; day: number } | null {
  const s = raw.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (
    !Number.isInteger(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null
  }
  const d = new Date(year, month - 1, day)
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null
  }
  return { year, month, day }
}

function tryFormatIsoDatePrefix(raw: string): string | null {
  const parts = parseIsoDateParts(raw)
  if (!parts) {
    return null
  }
  return `${parts.day}${ordinalSuffix(parts.day)} ${SHORT_MONTHS[parts.month - 1]} ${parts.year}`
}

function tryFormatTerseIsoDatePrefix(raw: string): string | null {
  const parts = parseIsoDateParts(raw)
  if (!parts) {
    return null
  }
  return `${parts.day}${ordinalSuffix(parts.day)} ${SHORT_MONTHS[parts.month - 1]}`
}

function tryFormatIsoMonthPrefix(raw: string): string | null {
  const match = MONTH_ONLY_PATTERN.exec(raw.trim())
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  return `${FULL_MONTHS[month - 1]} ${year}`
}

export function formatTimingFragment(raw: string): string {
  return (
    tryFormatIsoDatePrefix(raw) ??
    tryFormatIsoMonthPrefix(raw) ??
    raw.trim()
  )
}

export function formatTerseTimingFragment(raw: string): string {
  return (
    tryFormatTerseIsoDatePrefix(raw) ??
    tryFormatIsoMonthPrefix(raw) ??
    raw.trim()
  )
}

function capitalizeTimingQualifier(qualifier: TimingQualifier): string {
  return qualifier.charAt(0).toUpperCase() + qualifier.slice(1)
}

/** Table-friendly period label; year omitted for Q/H/month (Quarter column carries year). */
export function formatPeriodTerseLabel(
  periodKey: string,
  timingQualifier?: TimingQualifier,
): string | null {
  const match = PERIOD_KEY_PATTERN.exec(periodKey.trim())
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const suffix = match[2]

  if (!suffix) {
    return String(year)
  }

  if (suffix.startsWith("Q") || suffix.startsWith("H")) {
    return suffix
  }

  const month = Number(suffix)
  const monthName = FULL_MONTHS[month - 1]
  if (timingQualifier) {
    return `${capitalizeTimingQualifier(timingQualifier)} ${monthName}`
  }
  return monthName
}

export function parseIsoPrefixToLocalDate(raw: string | undefined): Date | null {
  if (!raw?.trim()) {
    return null
  }
  const trimmed = raw.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    if (
      !Number.isInteger(year) ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    ) {
      return null
    }
    const d = new Date(year, month - 1, day)
    if (
      d.getFullYear() !== year ||
      d.getMonth() !== month - 1 ||
      d.getDate() !== day
    ) {
      return null
    }
    return d
  }

  const monthOnlyMatch = MONTH_ONLY_PATTERN.exec(trimmed)
  if (!monthOnlyMatch) {
    return null
  }
  const year = Number(monthOnlyMatch[1])
  const month = Number(monthOnlyMatch[2])
  return new Date(year, month - 1, 1)
}

function isoDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function startOfLocalDay(now: number): Date {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function buildResearchHorizonEnd(now: number): string {
  const end = new Date(startOfLocalDay(now).getTime() + RESEARCH_HORIZON_MS)
  return isoDateString(end)
}

export function buildResearchRunDate(now: number): string {
  return isoDateString(startOfLocalDay(now))
}

function isWithinDaysOf(
  dateRaw: string | undefined,
  referenceRaw: string,
  days: number,
): boolean {
  const date = parseIsoPrefixToLocalDate(dateRaw)
  const reference = parseIsoPrefixToLocalDate(referenceRaw)
  if (!date || !reference) {
    return false
  }
  const diffDays = Math.abs(
    (date.getTime() - reference.getTime()) / (24 * 60 * 60 * 1000),
  )
  return diffDays <= days
}

function isHorizonEndDate(
  windowEnd: string | undefined,
  researchHorizonEnd: string,
): boolean {
  const end = parseIsoPrefixToLocalDate(windowEnd)
  const horizon = parseIsoPrefixToLocalDate(researchHorizonEnd)
  if (!end || !horizon) {
    return false
  }
  const diffDays = Math.abs(
    (end.getTime() - horizon.getTime()) / (24 * 60 * 60 * 1000),
  )
  return diffDays <= 2
}

export type ParsedPeriodKey = {
  label: string
  anchorStart: Date
  anchorEnd: Date
}

export function parsePeriodKey(key: string): ParsedPeriodKey | null {
  const match = PERIOD_KEY_PATTERN.exec(key.trim())
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const suffix = match[2]

  if (!suffix) {
    const anchorStart = new Date(year, 0, 1)
    const anchorEnd = new Date(year, 11, 31)
    return { label: String(year), anchorStart, anchorEnd }
  }

  if (suffix.startsWith("Q")) {
    const quarter = Number(suffix.slice(1))
    const startMonth = (quarter - 1) * 3
    const anchorStart = new Date(year, startMonth, 1)
    const anchorEnd = new Date(year, startMonth + 3, 0)
    return { label: `Q${quarter} ${year}`, anchorStart, anchorEnd }
  }

  if (suffix.startsWith("H")) {
    const half = Number(suffix.slice(1))
    const startMonth = half === 1 ? 0 : 6
    const anchorStart = new Date(year, startMonth, 1)
    const anchorEnd = new Date(year, startMonth + 6, 0)
    return { label: `H${half} ${year}`, anchorStart, anchorEnd }
  }

  const month = Number(suffix)
  const anchorStart = new Date(year, month - 1, 1)
  const anchorEnd = new Date(year, month, 0)
  return {
    label: `${FULL_MONTHS[month - 1]} ${year}`,
    anchorStart,
    anchorEnd,
  }
}

function periodAnchorFromKey(periodKey: string | undefined): Date | null {
  if (!periodKey) {
    return null
  }
  return parsePeriodKey(periodKey)?.anchorStart ?? null
}

export function parseSourceStart(event: CatalystTimingFields): Date | null {
  const fromStart = parseIsoPrefixToLocalDate(event.windowStart)
  if (fromStart) {
    return fromStart
  }

  if (event.timingShape === "open") {
    return periodAnchorFromKey(event.periodKey)
  }

  return null
}

function isBeforeLocalDay(date: Date, now: number): boolean {
  return date.getTime() < startOfLocalDay(now).getTime()
}

function omitTimingFields(
  event: CatalystResearch["events"][number],
): Omit<
  CatalystResearch["events"][number],
  "expectedDate" | "windowStart" | "windowEnd" | "periodKey" | "timingQualifier"
> {
  const {
    expectedDate: _expectedDate,
    windowStart: _windowStart,
    windowEnd: _windowEnd,
    periodKey: _periodKey,
    timingQualifier: _timingQualifier,
    ...rest
  } = event
  return rest
}

function stripHorizonEnd(
  event: CatalystResearch["events"][number],
  researchHorizonEnd: string,
): CatalystResearch["events"][number] {
  if (!event.windowEnd || !isHorizonEndDate(event.windowEnd, researchHorizonEnd)) {
    return event
  }

  const { windowEnd: _windowEnd, ...rest } = event
  let timingShape = event.timingShape

  if (timingShape === "closed_window") {
    timingShape = event.windowStart ? "from" : "open"
  }

  return { ...rest, timingShape }
}

function stripRunDateStart(
  event: CatalystResearch["events"][number],
  researchRunDate: string,
): CatalystResearch["events"][number] {
  if (
    !event.windowStart ||
    !isWithinDaysOf(event.windowStart, researchRunDate, 2) ||
    (event.timingShape !== "open" && event.timingShape !== "from")
  ) {
    return event
  }

  const { windowStart: _windowStart, ...rest } = event
  let timingShape = event.timingShape

  if (timingShape === "from") {
    timingShape = "open"
  }

  return { ...rest, timingShape }
}

function coerceFromPastStartToOpen(
  event: CatalystResearch["events"][number],
  researchRunDate: string,
): CatalystResearch["events"][number] {
  if (event.timingShape !== "from" || !event.windowStart) {
    return event
  }

  const start = parseIsoPrefixToLocalDate(event.windowStart)
  const runDate = parseIsoPrefixToLocalDate(researchRunDate)
  if (!start || !runDate || start.getTime() >= runDate.getTime()) {
    return event
  }

  return { ...event, timingShape: "open" }
}

function coerceMonthOnlyWindowStart(
  event: CatalystResearch["events"][number],
): CatalystResearch["events"][number] {
  if (!event.windowStart) {
    return event
  }

  const periodKey = event.windowStart.trim()
  if (!MONTH_ONLY_PATTERN.test(periodKey)) {
    return event
  }

  if (event.timingShape !== "open" && event.timingShape !== "from") {
    return event
  }

  const { windowStart: _windowStart, ...rest } = event

  return {
    ...rest,
    timingShape: "period",
    periodKey,
    datePrecision:
      event.datePrecision === "unknown" ? "month" : event.datePrecision,
  }
}

function withPeriodQualifier<T extends CatalystResearch["events"][number]>(
  event: CatalystResearch["events"][number],
  fields: T,
): T {
  if (!fields.periodKey) {
    return fields
  }

  const qualifier = normalizeTimingQualifier(event.timingQualifier)
  return qualifier ? { ...fields, timingQualifier: qualifier } : fields
}

function coerceShapeFields(
  event: CatalystResearch["events"][number],
): CatalystResearch["events"][number] {
  const base = omitTimingFields(event)
  const shape = event.timingShape

  switch (shape) {
    case "point":
      return {
        ...base,
        timingShape: shape,
        expectedDate: event.expectedDate,
        datePrecision: event.datePrecision,
      }
    case "closed_window":
      return {
        ...base,
        timingShape: shape,
        windowStart: event.windowStart,
        windowEnd: event.windowEnd,
        datePrecision: event.datePrecision,
      }
    case "from":
      return {
        ...base,
        timingShape: shape,
        windowStart: event.windowStart,
        datePrecision: event.datePrecision,
      }
    case "by":
      return {
        ...base,
        timingShape: shape,
        windowEnd: event.windowEnd,
        datePrecision: event.datePrecision,
      }
    case "period":
      return withPeriodQualifier(event, {
        ...base,
        timingShape: shape,
        periodKey: event.periodKey,
        datePrecision: event.datePrecision,
      })
    case "open":
      return withPeriodQualifier(event, {
        ...base,
        timingShape: shape,
        ...(event.windowStart ? { windowStart: event.windowStart } : {}),
        ...(event.periodKey ? { periodKey: event.periodKey } : {}),
        datePrecision: event.datePrecision,
      })
    case "unknown":
      return {
        ...base,
        timingShape: shape,
        datePrecision: event.datePrecision,
      }
    default: {
      const _exhaustive: never = shape
      return _exhaustive
    }
  }
}

export type NormalizeCatalystTimingOptions = {
  researchHorizonEnd: string
  researchRunDate: string
}

export function upgradeContradictoryTimingShape(
  event: CatalystResearch["events"][number],
): CatalystResearch["events"][number] {
  if (event.timingShape === "unknown") {
    if (event.expectedDate) {
      return { ...event, timingShape: "point" }
    }
    if (event.windowStart && event.windowEnd) {
      return { ...event, timingShape: "closed_window" }
    }
    if (event.windowStart) {
      return { ...event, timingShape: "from" }
    }
    if (event.windowEnd) {
      return { ...event, timingShape: "by" }
    }
    if (event.periodKey) {
      return { ...event, timingShape: "period" }
    }
    return event
  }

  if (event.timingShape === "closed_window") {
    if (event.windowStart && !event.windowEnd) {
      return { ...event, timingShape: "from" }
    }
    if (!event.windowStart && event.windowEnd) {
      return { ...event, timingShape: "by" }
    }
  }

  if (event.timingShape === "period" && !event.periodKey) {
    return { ...event, timingShape: "unknown" }
  }

  return event
}

export function normalizeCatalystEventTiming(
  event: CatalystResearch["events"][number],
  options: NormalizeCatalystTimingOptions,
): CatalystResearch["events"][number] {
  let normalized = stripHorizonEnd(event, options.researchHorizonEnd)
  normalized = coerceFromPastStartToOpen(normalized, options.researchRunDate)
  normalized = stripRunDateStart(normalized, options.researchRunDate)
  normalized = coerceMonthOnlyWindowStart(normalized)
  normalized = upgradeContradictoryTimingShape(normalized)
  return coerceShapeFields(normalized)
}

export function parseAnchorDate(event: CatalystTimingFields): Date | null {
  const fromExpected = parseIsoPrefixToLocalDate(event.expectedDate)
  if (fromExpected) {
    return fromExpected
  }

  const fromStart = parseIsoPrefixToLocalDate(event.windowStart)
  if (fromStart) {
    return fromStart
  }

  const fromPeriod = periodAnchorFromKey(event.periodKey)
  if (fromPeriod) {
    return fromPeriod
  }

  if (event.timingShape === "by") {
    return parseIsoPrefixToLocalDate(event.windowEnd)
  }

  return null
}

export function parseSortAnchor(
  event: CatalystTimingFields,
  now: number,
): Date | null {
  if (event.timingShape === "open") {
    const today = startOfLocalDay(now)
    const sourceStart = parseSourceStart(event)
    if (!sourceStart || isBeforeLocalDay(sourceStart, now)) {
      return today
    }
    return sourceStart
  }

  return parseAnchorDate(event)
}

export function eventTimingLabel(
  event: CatalystTimingFields,
  now: number = Date.now(),
): string {
  const qualifier = normalizeTimingQualifier(event.timingQualifier)

  switch (event.timingShape) {
    case "point":
      return event.expectedDate
        ? formatTerseTimingFragment(event.expectedDate)
        : "Timing unknown"
    case "closed_window":
      if (event.windowStart && event.windowEnd) {
        return `${formatTerseTimingFragment(event.windowStart)} - ${formatTerseTimingFragment(event.windowEnd)}`
      }
      return "Timing unknown"
    case "from":
      return event.windowStart
        ? `After ${formatTerseTimingFragment(event.windowStart)}`
        : "Timing unknown"
    case "by":
      return event.windowEnd
        ? `By ${formatTerseTimingFragment(event.windowEnd)}`
        : "Timing unknown"
    case "period": {
      if (!event.periodKey) {
        return "Timing unknown"
      }
      return (
        formatPeriodTerseLabel(event.periodKey, qualifier) ?? "Timing unknown"
      )
    }
    case "open": {
      if (event.windowStart) {
        const start = parseIsoPrefixToLocalDate(event.windowStart)
        const prefix =
          start && isBeforeLocalDay(start, now) ? "Since" : "From"
        return `${prefix} ${formatTerseTimingFragment(event.windowStart)} (ongoing)`
      }
      if (event.periodKey) {
        const parsed = parsePeriodKey(event.periodKey)
        const terse =
          formatPeriodTerseLabel(event.periodKey, qualifier) ?? event.periodKey
        if (parsed) {
          const prefix = isBeforeLocalDay(parsed.anchorStart, now)
            ? "Since"
            : ""
          return prefix
            ? `${prefix} ${terse} (ongoing)`
            : `${terse} (ongoing)`
        }
      }
      return "Ongoing"
    }
    case "unknown":
      return "Timing unknown"
    default: {
      const _exhaustive: never = event.timingShape
      return _exhaustive
    }
  }
}

export function isWithinResearchHorizon(
  event: CatalystTimingFields,
  now: number,
): boolean {
  if (event.timingShape === "unknown") {
    return false
  }

  const today = startOfLocalDay(now)
  const todayMs = today.getTime()
  const horizonEndMs = todayMs + RESEARCH_HORIZON_MS

  const anchor = parseAnchorDate(event)
  if (!anchor) {
    return false
  }

  const anchorMs = anchor.getTime()

  if (event.timingShape === "by") {
    const deadline = parseIsoPrefixToLocalDate(event.windowEnd)
    if (!deadline) {
      return false
    }
    const deadlineMs = deadline.getTime()
    return deadlineMs >= todayMs && deadlineMs <= horizonEndMs
  }

  if (anchorMs > horizonEndMs) {
    return false
  }

  if (anchorMs < todayMs && event.timingShape !== "open") {
    return false
  }

  if (event.timingShape === "closed_window" && event.windowEnd) {
    const end = parseIsoPrefixToLocalDate(event.windowEnd)
    if (end && end.getTime() < todayMs) {
      return false
    }
  }

  return true
}

export function quarterKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${Math.floor(d.getMonth() / 3)}`
}

export function formatQuarterLabel(d: Date): string {
  const q = Math.floor(d.getMonth() / 3) + 1
  return `Q${q} ${d.getFullYear()}`
}
