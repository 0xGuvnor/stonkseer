import { describe, expect, test } from "bun:test"

import { eventTimingLabel } from "./catalyst-timing"
import type { CatalystResearch } from "./research-contract"
import {
  inferTimingFromEventText,
  repairCatalystEventTiming,
} from "./catalyst-timing-infer"

const fixtureNow = Date.parse("2025-06-13T12:00:00Z")

const timingOptions = {
  researchHorizonEnd: "2026-06-13",
  researchRunDate: "2025-06-13",
}

function baseEvent(
  overrides: Partial<CatalystResearch["events"][number]> = {},
): CatalystResearch["events"][number] {
  return {
    title: "Test catalyst",
    summary: "Summary",
    whyItMatters: "Why",
    eventType: "product",
    timingShape: "unknown",
    datePrecision: "unknown",
    confidence: 0.85,
    status: "confirmed",
    expectedImpact: "medium",
    sources: [],
    ...overrides,
  }
}

describe("inferTimingFromEventText", () => {
  test("parses Q3–Q4 quarter range with en-dash", () => {
    const inferred = inferTimingFromEventText(
      "Lines being readied in Q3–Q4 2026 for production start.",
    )

    expect(inferred).toEqual({
      timingShape: "closed_window",
      windowStart: "2026-07-01",
      windowEnd: "2026-12-31",
      datePrecision: "quarter",
      specificity: 80,
    })
  })

  test("parses Q3-Q4 quarter range with hyphen", () => {
    const inferred = inferTimingFromEventText("Expected in Q3-Q4 2026.")

    expect(inferred?.timingShape).toBe("closed_window")
    expect(inferred?.windowStart).toBe("2026-07-01")
    expect(inferred?.windowEnd).toBe("2026-12-31")
  })

  test("parses single quarter", () => {
    const inferred = inferTimingFromEventText("Committee meetings in Q3 2026.")

    expect(inferred).toEqual({
      timingShape: "period",
      periodKey: "2026-Q3",
      datePrecision: "quarter",
      specificity: 65,
    })
  })

  test("parses half year", () => {
    const inferred = inferTimingFromEventText("Production in H2 2026.")

    expect(inferred).toEqual({
      timingShape: "period",
      periodKey: "2026-H2",
      datePrecision: "half",
      specificity: 70,
    })
  })

  test("parses month name and year", () => {
    const inferred = inferTimingFromEventText("Expected early July 2026.")

    expect(inferred).toEqual({
      timingShape: "period",
      periodKey: "2026-07",
      timingQualifier: "early",
      datePrecision: "month",
      specificity: 65,
    })
  })

  test("returns null for text without anchors", () => {
    expect(inferTimingFromEventText("Strategic importance remains unclear.")).toBeNull()
  })
})

describe("repairCatalystEventTiming", () => {
  test("repairs unknown timing from Megapack-like summary prose", () => {
    const event = baseEvent({
      title: "Megapack 3 Production Start at Houston-Area Megafactory",
      summary:
        "Tesla is preparing to begin production of its next-generation Megapack 3 energy storage system, with lines being readied in Q3-Q4 2026.",
      timingShape: "unknown",
      datePrecision: "unknown",
    })

    const repaired = repairCatalystEventTiming(event, timingOptions, fixtureNow)

    expect(repaired.timingShape).toBe("closed_window")
    expect(repaired.windowStart).toBe("2026-07-01")
    expect(repaired.windowEnd).toBe("2026-12-31")
    expect(eventTimingLabel(repaired, fixtureNow)).toBe(
      "1st Jul - 31st Dec",
    )
    expect(repaired.confidence).toBe(0.75)
    expect(repaired.status).toBe("likely")
  })

  test("upgrades unknown shape when periodKey is present", () => {
    const event = baseEvent({
      timingShape: "unknown",
      periodKey: "2026-H2",
      datePrecision: "half",
    })

    const repaired = repairCatalystEventTiming(event, timingOptions, fixtureNow)

    expect(repaired.timingShape).toBe("period")
    expect(repaired.periodKey).toBe("2026-H2")
    expect(eventTimingLabel(repaired, fixtureNow)).toBe("H2")
  })

  test("does not alter events with displayable timing", () => {
    const event = baseEvent({
      timingShape: "period",
      periodKey: "2026-07",
      datePrecision: "month",
      summary: "Q2 2026 deliveries expected early July 2026.",
    })

    const repaired = repairCatalystEventTiming(event, timingOptions, fixtureNow)

    expect(repaired.timingShape).toBe("period")
    expect(repaired.periodKey).toBe("2026-07")
    expect(repaired.confidence).toBe(0.85)
    expect(repaired.status).toBe("confirmed")
  })
})
