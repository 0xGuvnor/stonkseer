"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Bell } from "lucide-react"
import { toast } from "sonner"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { Id } from "@/convex/_generated/dataModel"
import {
  addToNotifyWatchlist,
  getNotificationPermission,
  isRunOnNotifyWatchlist,
  readResearchNotifyDefault,
  removeFromNotifyWatchlist,
  requestResearchNotificationPermission,
  RESEARCH_NOTIFY_WATCHLIST_CHANGED_EVENT,
  resolveNotifyPermissionResult,
  writeResearchNotifyDefault,
} from "@/lib/research-completion-notifications"

function subscribeToPermissionChanges(callback: () => void): () => void {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return () => {}
  }

  let cancelled = false
  let status: PermissionStatus | null = null

  navigator.permissions
    .query({ name: "notifications" as PermissionName })
    .then((result) => {
      if (cancelled) {
        return
      }
      status = result
      result.addEventListener("change", callback)
    })
    .catch(() => {
      // Permissions API can't observe notifications here; the snapshot is
      // still re-read on every render, so toggle interactions stay accurate.
    })

  return () => {
    cancelled = true
    status?.removeEventListener("change", callback)
  }
}

function getServerNotificationPermission(): "unsupported" {
  return "unsupported"
}

function subscribeToWatchlistChanges(callback: () => void): () => void {
  window.addEventListener(RESEARCH_NOTIFY_WATCHLIST_CHANGED_EVENT, callback)
  window.addEventListener("storage", callback)

  return () => {
    window.removeEventListener(
      RESEARCH_NOTIFY_WATCHLIST_CHANGED_EVENT,
      callback
    )
    window.removeEventListener("storage", callback)
  }
}

function getServerWatchlistMembership(): boolean {
  return false
}

export type ResearchNotifyToggleProps = {
  runId: Id<"researchRuns">
  symbol: string
  anonymousTokenHash?: string
}

export function ResearchNotifyToggle({
  runId,
  symbol,
  anonymousTokenHash,
}: ResearchNotifyToggleProps) {
  const permission = useSyncExternalStore(
    subscribeToPermissionChanges,
    getNotificationPermission,
    getServerNotificationPermission
  )
  const onWatchlist = useSyncExternalStore(
    subscribeToWatchlistChanges,
    () => isRunOnNotifyWatchlist(runId),
    getServerWatchlistMembership
  )

  const [awaitingPrompt, setAwaitingPrompt] = useState(false)
  // Increments whenever the user changes intent, so a permission request that
  // settles late (or never) can't override a newer toggle action.
  const requestIdRef = useRef(0)

  // Auto-enable for new runs when the user previously opted in and
  // notifications are already allowed.
  useEffect(() => {
    if (getNotificationPermission() !== "granted") {
      return
    }
    if (isRunOnNotifyWatchlist(runId) || !readResearchNotifyDefault()) {
      return
    }
    addToNotifyWatchlist({ runId, symbol, anonymousTokenHash })
  }, [anonymousTokenHash, runId, symbol])

  if (permission === "unsupported") {
    return null
  }

  function handleCheckedChange(checked: boolean) {
    if (!checked) {
      requestIdRef.current += 1
      setAwaitingPrompt(false)
      removeFromNotifyWatchlist(runId)
      writeResearchNotifyDefault(false)
      return
    }

    if (permission === "granted") {
      addToNotifyWatchlist({ runId, symbol, anonymousTokenHash })
      writeResearchNotifyDefault(true)
      toast.success("You'll be notified when research finishes.")
      return
    }

    if (permission === "denied") {
      return
    }

    // Permission is "default": check the switch optimistically and request in
    // the background. Browsers may suppress the prompt and leave the promise
    // pending forever, so the UI must never block on it.
    setAwaitingPrompt(true)
    const requestId = ++requestIdRef.current

    void requestResearchNotificationPermission().then((result) => {
      if (requestIdRef.current !== requestId) {
        return
      }

      setAwaitingPrompt(false)
      const resolution = resolveNotifyPermissionResult(result)

      if (resolution === "enabled") {
        addToNotifyWatchlist({ runId, symbol, anonymousTokenHash })
        writeResearchNotifyDefault(true)
        toast.success("You'll be notified when research finishes.")
        return
      }

      if (resolution === "blocked") {
        toast.error(
          "Browser notifications are blocked. Enable them in your browser's site settings to get alerts."
        )
      }
    })
  }

  const isBlocked = permission === "denied"
  const isChecked = !isBlocked && (onWatchlist || awaitingPrompt)

  const helpText = isBlocked
    ? "Notifications are blocked for this site. Enable them in your browser's site settings."
    : awaitingPrompt
      ? "Allow notifications in the browser prompt to turn this on."
      : "Works while this Stonkseer tab stays open."

  return (
    <div className="mt-5 flex items-start gap-3 rounded-xl border border-border/40 bg-muted/20 p-3">
      <Bell className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center justify-between gap-3">
          <Label
            htmlFor={`research-notify-${runId}`}
            className="text-sm font-medium"
          >
            Notify me when research finishes
          </Label>
          <Switch
            id={`research-notify-${runId}`}
            checked={isChecked}
            disabled={isBlocked}
            onCheckedChange={handleCheckedChange}
            aria-describedby={`research-notify-help-${runId}`}
          />
        </div>
        <p
          id={`research-notify-help-${runId}`}
          className="text-xs text-muted-foreground"
        >
          {helpText}
        </p>
      </div>
    </div>
  )
}
