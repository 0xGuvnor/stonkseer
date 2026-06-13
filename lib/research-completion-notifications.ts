import type { Id } from "@/convex/_generated/dataModel"

export const RESEARCH_NOTIFY_WATCHLIST_KEY = "stonkseer:researchNotifyWatchlist"
export const RESEARCH_NOTIFY_DEFAULT_KEY = "stonkseer:researchNotifyDefault"
export const RESEARCH_NOTIFY_WATCHLIST_CHANGED_EVENT =
  "stonkseer:research-notify-watchlist-changed"

export type ResearchNotifyWatchlistEntry = {
  runId: Id<"researchRuns">
  symbol: string
  anonymousTokenHash?: string
  addedAt: number
}

export type ResearchTerminalStatus = "completed" | "failed"

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window
}

export function getNotificationPermission():
  | NotificationPermission
  | "unsupported" {
  if (!isBrowserNotificationSupported()) {
    return "unsupported"
  }
  return Notification.permission
}

export async function requestResearchNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!isBrowserNotificationSupported()) {
    return "unsupported"
  }

  if (Notification.permission === "granted") {
    return "granted"
  }

  if (Notification.permission === "denied") {
    return "denied"
  }

  return Notification.requestPermission()
}

export type NotifyPermissionResolution =
  | "enabled"
  | "blocked"
  | "dismissed"
  | "unsupported"

export function resolveNotifyPermissionResult(
  result: NotificationPermission | "unsupported"
): NotifyPermissionResolution {
  switch (result) {
    case "granted":
      return "enabled"
    case "denied":
      return "blocked"
    case "default":
      return "dismissed"
    case "unsupported":
      return "unsupported"
    default: {
      const exhaustive: never = result
      return exhaustive
    }
  }
}

export function readResearchNotifyDefault(): boolean {
  if (typeof localStorage === "undefined") {
    return false
  }
  return localStorage.getItem(RESEARCH_NOTIFY_DEFAULT_KEY) === "true"
}

export function writeResearchNotifyDefault(enabled: boolean): void {
  if (typeof localStorage === "undefined") {
    return
  }
  localStorage.setItem(RESEARCH_NOTIFY_DEFAULT_KEY, enabled ? "true" : "false")
}

function isWatchlistEntry(value: unknown): value is ResearchNotifyWatchlistEntry {
  if (!value || typeof value !== "object") {
    return false
  }

  const record = value as Record<string, unknown>
  return (
    typeof record.runId === "string" &&
    typeof record.symbol === "string" &&
    typeof record.addedAt === "number" &&
    (record.anonymousTokenHash === undefined ||
      typeof record.anonymousTokenHash === "string")
  )
}

export function parseNotifyWatchlist(raw: string): ResearchNotifyWatchlistEntry[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(isWatchlistEntry)
  } catch {
    return []
  }
}

export function readNotifyWatchlist(): ResearchNotifyWatchlistEntry[] {
  if (typeof localStorage === "undefined") {
    return []
  }

  const raw = localStorage.getItem(RESEARCH_NOTIFY_WATCHLIST_KEY)
  if (!raw) {
    return []
  }

  return parseNotifyWatchlist(raw)
}

function writeNotifyWatchlist(entries: ResearchNotifyWatchlistEntry[]): void {
  if (typeof localStorage === "undefined") {
    return
  }

  localStorage.setItem(RESEARCH_NOTIFY_WATCHLIST_KEY, JSON.stringify(entries))
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(RESEARCH_NOTIFY_WATCHLIST_CHANGED_EVENT))
  }
}

export function addToNotifyWatchlist(
  entry: Omit<ResearchNotifyWatchlistEntry, "addedAt"> & { addedAt?: number }
): void {
  const entries = readNotifyWatchlist().filter(
    (existing) => existing.runId !== entry.runId
  )

  entries.push({
    runId: entry.runId,
    symbol: entry.symbol.toUpperCase(),
    ...(entry.anonymousTokenHash !== undefined
      ? { anonymousTokenHash: entry.anonymousTokenHash }
      : {}),
    addedAt: entry.addedAt ?? Date.now(),
  })

  writeNotifyWatchlist(entries)
}

export function removeFromNotifyWatchlist(runId: Id<"researchRuns">): void {
  const entries = readNotifyWatchlist().filter(
    (existing) => existing.runId !== runId
  )
  writeNotifyWatchlist(entries)
}

export function isRunOnNotifyWatchlist(runId: Id<"researchRuns">): boolean {
  return readNotifyWatchlist().some((entry) => entry.runId === runId)
}

function buildNotificationContent(args: {
  symbol: string
  status: ResearchTerminalStatus
  eventCount?: number
  error?: string
}): { title: string; body: string } {
  const symbol = args.symbol.toUpperCase()

  if (args.status === "failed") {
    const errorSuffix = args.error?.trim()
      ? ` ${args.error.trim()}`
      : " Try again from the home page."
    return {
      title: `Research failed for ${symbol}`,
      body: `Catalyst research did not complete.${errorSuffix}`,
    }
  }

  if (args.eventCount === 0) {
    return {
      title: `${symbol} research finished`,
      body: "Research completed, but no catalyst events were found.",
    }
  }

  const count = args.eventCount ?? 0
  return {
    title: `${symbol} research is ready`,
    body: `Found ${count} catalyst${count === 1 ? "" : "s"}. Tap to view results.`,
  }
}

export function showResearchCompletionNotification(args: {
  runId: Id<"researchRuns">
  symbol: string
  status: ResearchTerminalStatus
  eventCount?: number
  error?: string
}): void {
  if (!isBrowserNotificationSupported()) {
    return
  }

  if (Notification.permission !== "granted") {
    return
  }

  const { title, body } = buildNotificationContent(args)
  const symbol = args.symbol.toUpperCase()

  let notification: Notification
  try {
    notification = new Notification(title, {
      body,
      tag: args.runId,
    })
  } catch {
    // Chrome on Android throws for page-context notifications (they require a
    // service worker), so degrade to a silent no-op instead of crashing.
    return
  }

  notification.onclick = () => {
    window.focus()
    window.location.assign(`/${symbol}`)
    notification.close()
  }
}

export function isResearchRunInFlight(status: string): boolean {
  return status === "queued" || status === "running"
}

export function isResearchRunTerminal(status: string): status is ResearchTerminalStatus {
  return status === "completed" || status === "failed"
}
