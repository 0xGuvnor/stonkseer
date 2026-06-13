"use client"

import { useAuth } from "@clerk/nextjs"
import { useConvexAuth, useQuery } from "convex/react"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import {
  isResearchRunInFlight,
  isResearchRunTerminal,
  readNotifyWatchlist,
  removeFromNotifyWatchlist,
  RESEARCH_NOTIFY_WATCHLIST_CHANGED_EVENT,
  showResearchCompletionNotification,
  type ResearchNotifyWatchlistEntry,
} from "@/lib/research-completion-notifications"

function ResearchRunWatchEntry({
  entry,
  pathname,
  canQueryAuthenticated,
}: {
  entry: ResearchNotifyWatchlistEntry
  pathname: string
  canQueryAuthenticated: boolean
}) {
  const hasAnonymousAccess = entry.anonymousTokenHash !== undefined
  const shouldLoadResults = hasAnonymousAccess || canQueryAuthenticated

  const results = useQuery(
    api.research.getRunResults,
    shouldLoadResults
      ? {
          runId: entry.runId,
          anonymousTokenHash: entry.anonymousTokenHash,
        }
      : "skip"
  )

  const previousStatusRef = useRef<string | null>(null)
  const notifiedRef = useRef(false)

  useEffect(() => {
    if (!shouldLoadResults) {
      return
    }

    if (results === undefined) {
      return
    }

    if (results === null) {
      removeFromNotifyWatchlist(entry.runId)
      return
    }

    const status = results.run.status
    const previousStatus = previousStatusRef.current

    if (previousStatus === null) {
      if (isResearchRunTerminal(status)) {
        removeFromNotifyWatchlist(entry.runId)
      }
      previousStatusRef.current = status
      return
    }

    const transitionedToTerminal =
      isResearchRunInFlight(previousStatus) && isResearchRunTerminal(status)

    previousStatusRef.current = status

    if (!transitionedToTerminal || notifiedRef.current) {
      return
    }

    notifiedRef.current = true

    const symbolPath = `/${entry.symbol.toUpperCase()}`
    const shouldNotify = document.hidden || pathname !== symbolPath

    if (shouldNotify) {
      showResearchCompletionNotification({
        runId: entry.runId,
        symbol: entry.symbol,
        status,
        eventCount: results.events.length,
        error: results.run.error,
      })
    }

    removeFromNotifyWatchlist(entry.runId)
  }, [
    canQueryAuthenticated,
    entry.runId,
    entry.symbol,
    pathname,
    results,
    shouldLoadResults,
  ])

  return null
}

export function ResearchCompletionNotifier() {
  const pathname = usePathname()
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth()
  const { isAuthenticated } = useConvexAuth()
  const me = useQuery(api.users.current, isAuthenticated ? {} : "skip")

  const [watchlist, setWatchlist] = useState<ResearchNotifyWatchlistEntry[]>(
    []
  )

  useEffect(() => {
    function refreshWatchlist() {
      setWatchlist(readNotifyWatchlist())
    }

    refreshWatchlist()

    window.addEventListener(
      RESEARCH_NOTIFY_WATCHLIST_CHANGED_EVENT,
      refreshWatchlist
    )
    window.addEventListener("storage", refreshWatchlist)

    return () => {
      window.removeEventListener(
        RESEARCH_NOTIFY_WATCHLIST_CHANGED_EVENT,
        refreshWatchlist
      )
      window.removeEventListener("storage", refreshWatchlist)
    }
  }, [])

  const hasAuthenticatedRunAccess =
    clerkLoaded &&
    isSignedIn &&
    isAuthenticated &&
    me !== undefined &&
    me !== null

  if (watchlist.length === 0) {
    return null
  }

  return (
    <>
      {watchlist.map((entry) => (
        <ResearchRunWatchEntry
          key={entry.runId as Id<"researchRuns">}
          entry={entry}
          pathname={pathname}
          canQueryAuthenticated={hasAuthenticatedRunAccess}
        />
      ))}
    </>
  )
}
