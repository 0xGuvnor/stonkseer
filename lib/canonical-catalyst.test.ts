import { describe, expect, test } from "bun:test"

import type { Id } from "../convex/_generated/dataModel"
import {
  selectNewestCompletedRunId,
  shouldDedupeStockEvents,
} from "./canonical-catalyst"

describe("selectNewestCompletedRunId", () => {
  test("returns the run with the latest completedAt", () => {
    const older = {
      _id: "run_old" as Id<"researchRuns">,
      completedAt: 100,
    }
    const newer = {
      _id: "run_new" as Id<"researchRuns">,
      completedAt: 200,
    }

    expect(selectNewestCompletedRunId([older, newer])).toBe(newer._id)
  })

  test("returns null when no completed runs exist", () => {
    expect(
      selectNewestCompletedRunId([
        null,
        { _id: "run_x" as Id<"researchRuns"> },
      ]),
    ).toBe(null)
  })
})

describe("shouldDedupeStockEvents", () => {
  test("requires dedupe when multiple source runs exist", () => {
    expect(shouldDedupeStockEvents(2)).toBe(true)
    expect(shouldDedupeStockEvents(1)).toBe(false)
  })
})
