import { describe, expect, test } from "bun:test"

import type { Id } from "@/convex/_generated/dataModel"
import type { CatalystEventView } from "@/types/research-ui"

import {
  isUnknownTimingWithoutQuarter,
  sortCatalystEventsByAnchor,
} from "./research-results-utils"

const fixtureNow = Date.parse("2025-06-13T12:00:00Z")

function catalystEvent(
  id: string,
  overrides: Partial<CatalystEventView> = {},
): CatalystEventView {
  return {
    _id: id as Id<"catalystEvents">,
    title: "Test catalyst",
    summary: "Summary",
    whyItMatters: "Why",
    eventType: "product",
    timingShape: "point",
    datePrecision: "quarter",
    confidence: 0.7,
    expectedImpact: "medium",
    sources: [],
    ...overrides,
  }
}

describe("isUnknownTimingWithoutQuarter", () => {
  test("returns true for unknown shape without dates", () => {
    expect(
      isUnknownTimingWithoutQuarter(
        catalystEvent("evt_unknown", {
          timingShape: "unknown",
          datePrecision: "unknown",
        }),
        fixtureNow,
      ),
    ).toBe(true)
  })

  test("returns false for dated point events", () => {
    expect(
      isUnknownTimingWithoutQuarter(
        catalystEvent("evt_dated", {
          timingShape: "point",
          expectedDate: "2026-05-01",
        }),
        fixtureNow,
      ),
    ).toBe(false)
  })

  test("returns false for closed_window with only windowStart", () => {
    expect(
      isUnknownTimingWithoutQuarter(
        catalystEvent("evt_partial_window", {
          timingShape: "closed_window",
          windowStart: "2026-04-01",
        }),
        fixtureNow,
      ),
    ).toBe(false)
  })
})

describe("sortCatalystEventsByAnchor", () => {
  test("sorts unknown timing without quarter before dated events", () => {
    const unknown = catalystEvent("evt_unknown", {
      timingShape: "unknown",
      datePrecision: "unknown",
    })
    const dated = catalystEvent("evt_dated", {
      timingShape: "point",
      expectedDate: "2026-05-01",
    })

    const sorted = sortCatalystEventsByAnchor([dated, unknown], fixtureNow)

    expect(sorted.map((event) => event._id)).toEqual([
      "evt_unknown" as Id<"catalystEvents">,
      "evt_dated" as Id<"catalystEvents">,
    ])
  })

  test("keeps multiple unknown events before chronological dated events", () => {
    const unknownA = catalystEvent("evt_unknown_a", {
      timingShape: "unknown",
      datePrecision: "unknown",
    })
    const unknownB = catalystEvent("evt_unknown_b", {
      timingShape: "point",
      datePrecision: "unknown",
    })
    const dated = catalystEvent("evt_dated", {
      timingShape: "point",
      expectedDate: "2026-05-01",
    })

    const sorted = sortCatalystEventsByAnchor(
      [dated, unknownB, unknownA],
      fixtureNow,
    )

    expect(sorted.map((event) => event._id)).toEqual([
      "evt_unknown_a" as Id<"catalystEvents">,
      "evt_unknown_b" as Id<"catalystEvents">,
      "evt_dated" as Id<"catalystEvents">,
    ])
  })

  test("does not force closed_window with only windowStart to the top", () => {
    const partialWindow = catalystEvent("evt_partial_window", {
      timingShape: "closed_window",
      windowStart: "2026-08-01",
    })
    const earlier = catalystEvent("evt_earlier", {
      timingShape: "point",
      expectedDate: "2026-05-01",
    })

    const sorted = sortCatalystEventsByAnchor(
      [partialWindow, earlier],
      fixtureNow,
    )

    expect(sorted.map((event) => event._id)).toEqual([
      "evt_earlier" as Id<"catalystEvents">,
      "evt_partial_window" as Id<"catalystEvents">,
    ])
  })
})
