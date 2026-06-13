import { describe, expect, it } from "bun:test"

import type { Id } from "@/convex/_generated/dataModel"
import {
  isResearchRunInFlight,
  isResearchRunTerminal,
  parseNotifyWatchlist,
  resolveNotifyPermissionResult,
} from "./research-completion-notifications"

describe("parseNotifyWatchlist", () => {
  it("returns an empty array for invalid JSON", () => {
    expect(parseNotifyWatchlist("not-json")).toEqual([])
  })

  it("filters invalid entries and keeps valid ones", () => {
    const raw = JSON.stringify([
      {
        runId: "run_1",
        symbol: "aapl",
        addedAt: 1,
      },
      { runId: "bad" },
      null,
    ])

    expect(parseNotifyWatchlist(raw)).toEqual([
      {
        runId: "run_1" as Id<"researchRuns">,
        symbol: "aapl",
        addedAt: 1,
      },
    ])
  })
})

describe("resolveNotifyPermissionResult", () => {
  it("maps granted to enabled", () => {
    expect(resolveNotifyPermissionResult("granted")).toBe("enabled")
  })

  it("maps denied to blocked", () => {
    expect(resolveNotifyPermissionResult("denied")).toBe("blocked")
  })

  it("maps a dismissed prompt (default) to dismissed", () => {
    expect(resolveNotifyPermissionResult("default")).toBe("dismissed")
  })

  it("passes unsupported through", () => {
    expect(resolveNotifyPermissionResult("unsupported")).toBe("unsupported")
  })
})

describe("research run status helpers", () => {
  it("detects in-flight statuses", () => {
    expect(isResearchRunInFlight("queued")).toBe(true)
    expect(isResearchRunInFlight("running")).toBe(true)
    expect(isResearchRunInFlight("completed")).toBe(false)
  })

  it("detects terminal statuses", () => {
    expect(isResearchRunTerminal("completed")).toBe(true)
    expect(isResearchRunTerminal("failed")).toBe(true)
    expect(isResearchRunTerminal("running")).toBe(false)
  })
})
