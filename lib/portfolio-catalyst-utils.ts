import type { CatalystEventView } from "@/types/research-ui"

import { parseAnchorDate, sortCatalystEventsByAnchor } from "./research-results-utils"

/** Research horizon: upcoming catalysts within the next 12 months. */
export const PORTFOLIO_UPCOMING_HORIZON_MS = 365 * 24 * 60 * 60 * 1000

export function isUpcomingCatalystEvent(
  event: CatalystEventView,
  now: number,
): boolean {
  const anchor = parseAnchorDate(event)
  if (!anchor) {
    return false
  }

  const startOfToday = new Date(
    new Date(now).getFullYear(),
    new Date(now).getMonth(),
    new Date(now).getDate(),
  )
  const horizonEnd = startOfToday.getTime() + PORTFOLIO_UPCOMING_HORIZON_MS

  const anchorTime = anchor.getTime()
  return anchorTime >= startOfToday.getTime() && anchorTime <= horizonEnd
}

export function filterUpcomingCatalystEvents<T extends CatalystEventView>(
  events: T[],
  now: number,
): T[] {
  const filtered = events.filter((event) => isUpcomingCatalystEvent(event, now))
  return sortCatalystEventsByAnchor(filtered) as T[]
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
  const anchor = parseAnchorDate(event)
  if (!anchor) {
    return null
  }

  const startOfToday = new Date(
    new Date(now).getFullYear(),
    new Date(now).getMonth(),
    new Date(now).getDate(),
  )
  const diffMs = anchor.getTime() - startOfToday.getTime()
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000))
}
