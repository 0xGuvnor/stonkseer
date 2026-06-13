import type { CatalystEventView } from "@/types/research-ui"

import {
  isWithinResearchHorizon,
  parseSourceStart,
  startOfLocalDay,
} from "./catalyst-timing"
import {
  parseAnchorDate,
  sortCatalystEventsByAnchor,
} from "./research-results-utils"

export { RESEARCH_HORIZON_MS } from "./catalyst-timing"

export function isUpcomingCatalystEvent(
  event: CatalystEventView,
  now: number,
): boolean {
  return isWithinResearchHorizon(event, now)
}

export function filterUpcomingCatalystEvents<T extends CatalystEventView>(
  events: T[],
  now: number,
): T[] {
  const filtered = events.filter((event) => isUpcomingCatalystEvent(event, now))
  return sortCatalystEventsByAnchor(filtered, now) as T[]
}

export function findNearestUpcomingEvent<T extends CatalystEventView>(
  events: T[],
  now: number,
): T | undefined {
  const upcoming = filterUpcomingCatalystEvents(events, now)
  return upcoming[0]
}

export function daysUntilAnchor(
  event: CatalystEventView,
  now: number,
): number | null {
  if (event.timingShape === "open") {
    const sourceStart = parseSourceStart(event)
    const today = startOfLocalDay(now)
    if (!sourceStart || sourceStart.getTime() < today.getTime()) {
      return 0
    }
  }

  const anchor = parseAnchorDate(event)
  if (!anchor) {
    return event.timingShape === "open" ? 0 : null
  }

  const startOfToday = startOfLocalDay(now)
  const diffMs = anchor.getTime() - startOfToday.getTime()
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000))
}
