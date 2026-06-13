import type { CatalystEventView } from "@/types/research-ui"

import {
  type CatalystTimingFields,
  eventTimingLabel as catalystEventTimingLabel,
  formatQuarterLabel,
  formatTimingFragment,
  parseAnchorDate as catalystParseAnchorDate,
  parseSortAnchor as catalystParseSortAnchor,
  quarterKeyFromDate,
} from "./catalyst-timing"

export {
  formatQuarterLabel,
  formatTimingFragment,
  quarterKeyFromDate,
} from "./catalyst-timing"

export function parseAnchorDate(event: CatalystEventView): Date | null {
  return catalystParseAnchorDate(event)
}

export function parseSortAnchor(
  event: CatalystEventView,
  now: number = Date.now(),
): Date | null {
  return catalystParseSortAnchor(event, now)
}

export function eventTimingLabel(
  event: CatalystTimingFields,
  now: number = Date.now(),
) {
  return catalystEventTimingLabel(event, now)
}

export function sortCatalystEventsByAnchor(
  events: CatalystEventView[],
  now: number = Date.now(),
) {
  return [...events].sort((a, b) => {
    const da = parseSortAnchor(a, now)
    const db = parseSortAnchor(b, now)
    const ta = da ? da.getTime() : Number.POSITIVE_INFINITY
    const tb = db ? db.getTime() : Number.POSITIVE_INFINITY
    if (ta !== tb) {
      return ta - tb
    }
    return a._id < b._id ? -1 : a._id > b._id ? 1 : 0
  })
}
