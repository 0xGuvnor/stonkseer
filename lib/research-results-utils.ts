import type { CatalystEventView } from "@/types/research-ui"

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

/** Parses leading YYYY-MM-DD (optionally followed by time) as a calendar local date. */
function tryFormatIsoDatePrefix(raw: string): string | null {
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
  return `${day}${ordinalSuffix(day)} ${SHORT_MONTHS[d.getMonth()]} ${year}`
}

export function formatTimingFragment(raw: string): string {
  return tryFormatIsoDatePrefix(raw) ?? raw.trim()
}

/** Local calendar date from leading YYYY-MM-DD, or null if not parseable. */
function parseIsoPrefixToLocalDate(raw: string | undefined): Date | null {
  if (!raw?.trim()) {
    return null
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim())
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
  return d
}

/** Anchor date for quarter + sort: expectedDate, else windowStart, else windowEnd. */
export function parseAnchorDate(event: CatalystEventView): Date | null {
  return (
    parseIsoPrefixToLocalDate(event.expectedDate) ??
    parseIsoPrefixToLocalDate(event.windowStart) ??
    parseIsoPrefixToLocalDate(event.windowEnd)
  )
}

export function eventTimingLabel(event: {
  expectedDate?: string
  windowStart?: string
  windowEnd?: string
  datePrecision: string
}) {
  if (event.expectedDate) {
    return formatTimingFragment(event.expectedDate)
  }

  if (event.windowStart && event.windowEnd) {
    return `${formatTimingFragment(event.windowStart)} - ${formatTimingFragment(event.windowEnd)}`
  }

  if (event.windowStart) {
    return `After ${formatTimingFragment(event.windowStart)}`
  }

  if (event.windowEnd) {
    return `By ${formatTimingFragment(event.windowEnd)}`
  }

  return event.datePrecision === "unknown"
    ? "Timing unknown"
    : `Timing: ${event.datePrecision}`
}

export function quarterKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${Math.floor(d.getMonth() / 3)}`
}

export function formatQuarterLabel(d: Date): string {
  const q = Math.floor(d.getMonth() / 3) + 1
  return `Q${q} ${d.getFullYear()}`
}

export function sortCatalystEventsByAnchor(events: CatalystEventView[]) {
  return [...events].sort((a, b) => {
    const da = parseAnchorDate(a)
    const db = parseAnchorDate(b)
    const ta = da ? da.getTime() : Number.POSITIVE_INFINITY
    const tb = db ? db.getTime() : Number.POSITIVE_INFINITY
    if (ta !== tb) {
      return ta - tb
    }
    return a._id < b._id ? -1 : a._id > b._id ? 1 : 0
  })
}
