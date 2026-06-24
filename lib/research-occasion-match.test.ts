import { describe, expect, test } from "bun:test"

import type { CatalystResearch } from "./research-contract"
import {
  dedupeIntraRunCatalystEventsDeterministic,
} from "./research-inrun-dedupe"
import {
  mergeOccasionEvents,
  scoreOccasionPair,
} from "./research-occasion-match"

type CatalystEvent = CatalystResearch["events"][number]

function baseEvent(overrides: Partial<CatalystEvent> = {}): CatalystEvent {
  return {
    title: "Placeholder catalyst",
    summary: "Summary text.",
    whyItMatters: "Market relevance.",
    eventType: "product",
    timingShape: "unknown",
    datePrecision: "unknown",
    confidence: 0.7,
    status: "likely",
    expectedImpact: "medium",
    sources: [
      {
        url: "https://example.com/source-a",
        title: "Source A",
        publisher: "example.com",
        quote: "Quote A.",
        supportsFields: ["summary"],
      },
    ],
    ...overrides,
  }
}

describe("scoreOccasionPair", () => {
  test("strong match for same production start with different headline detail", () => {
    const generic = baseEvent({
      title: "Grid Battery 3 Start of Production",
      summary:
        "The company is preparing production lines for its next grid battery system, with manufacturing expected to begin in 2026.",
      timingShape: "period",
      periodKey: "2026-H2",
      datePrecision: "half",
    })

    const siteSpecific = baseEvent({
      title:
        "Grid Battery 3 and Integrated Block Start of Production at Regional Megafactory",
      summary:
        "Plans to begin production at a new regional facility in the second half of 2026, targeting 50 GWh annual capacity.",
      timingShape: "period",
      periodKey: "2026-H2",
      datePrecision: "half",
      sources: [
        {
          url: "https://example.com/source-b",
          title: "Source B",
          publisher: "example.com",
          quote: "50 GWh capacity in H2 2026.",
          supportsFields: ["summary"],
        },
      ],
    })

    const result = scoreOccasionPair(generic, siteSpecific)

    expect(result.kind).toBe("strong")
    expect(result.score).toBeGreaterThanOrEqual(3)
  })

  test("rejects conflicting earnings quarters", () => {
    const q2 = baseEvent({
      title: "Q2 2026 earnings release",
      eventType: "earnings",
      timingShape: "period",
      periodKey: "2026-Q2",
      datePrecision: "quarter",
    })

    const q3 = baseEvent({
      title: "Q3 2026 earnings release",
      eventType: "earnings",
      timingShape: "period",
      periodKey: "2026-Q3",
      datePrecision: "quarter",
    })

    expect(scoreOccasionPair(q2, q3).kind).toBe("reject")
  })

  test("keeps separate unrelated products in the same half", () => {
    const battery = baseEvent({
      title: "Grid Battery 3 production start",
      summary: "Next-generation grid battery production at the regional megafactory.",
      timingShape: "period",
      periodKey: "2026-H2",
      datePrecision: "half",
      sources: [
        {
          url: "https://example.com/battery",
          title: "Battery source",
          publisher: "example.com",
          quote: "Grid battery production.",
          supportsFields: ["summary"],
        },
      ],
    })

    const vehicle = baseEvent({
      title: "Compact EV platform launch",
      summary: "New compact electric vehicle platform debut scheduled for late 2026.",
      timingShape: "period",
      periodKey: "2026-H2",
      datePrecision: "half",
      sources: [
        {
          url: "https://example.com/vehicle",
          title: "Vehicle source",
          publisher: "example.com",
          quote: "Compact EV platform.",
          supportsFields: ["summary"],
        },
      ],
    })

    expect(scoreOccasionPair(battery, vehicle).kind).toBe("none")
  })
})

describe("mergeOccasionEvents", () => {
  test("prefers the more specific title", () => {
    const generic = baseEvent({
      title: "Grid Battery 3 Start of Production",
    })

    const specific = baseEvent({
      title:
        "Grid Battery 3 Production Start at Regional Megafactory",
      summary: "Brookshire-area facility later in 2026.",
    })

    const merged = mergeOccasionEvents(generic, specific)

    expect(merged.title).toBe(
      "Grid Battery 3 Production Start at Regional Megafactory",
    )
  })

  test("prefers displayable timing over empty closed_window on higher-confidence row", () => {
    const incomplete = baseEvent({
      title: "Grid Battery 3 Production Start",
      summary: "Production lines being readied.",
      timingShape: "closed_window",
      datePrecision: "quarter",
      confidence: 0.9,
    })

    const timed = baseEvent({
      title: "Grid Battery 3 Production Start at Regional Megafactory",
      summary: "Manufacturing expected in H2 2026.",
      timingShape: "period",
      periodKey: "2026-H2",
      datePrecision: "half",
      confidence: 0.6,
    })

    const merged = mergeOccasionEvents(incomplete, timed)

    expect(merged.timingShape).toBe("period")
    expect(merged.periodKey).toBe("2026-H2")
  })
})

describe("dedupeIntraRunCatalystEventsDeterministic", () => {
  test("merges three production-start variants into one row", () => {
    const generic = baseEvent({
      title: "Grid Battery 3 Start of Production",
      summary:
        "Manufacturing expected to begin in 2026 for the next grid battery system.",
      timingShape: "period",
      periodKey: "2026-H2",
      datePrecision: "half",
    })

    const siteSpecific = baseEvent({
      title:
        "Grid Battery 3 and Integrated Block Start of Production at Regional Megafactory",
      summary:
        "Production at the regional facility in H2 2026 with 50 GWh annual capacity.",
      timingShape: "period",
      periodKey: "2026-H2",
      datePrecision: "half",
      sources: [
        {
          url: "https://example.com/source-b",
          title: "Source B",
          publisher: "example.com",
          quote: "50 GWh in H2 2026.",
          supportsFields: ["summary"],
        },
      ],
    })

    const timingUnknown = baseEvent({
      title: "Grid Battery 3 Production Start at Regional Megafactory",
      summary:
        "Plans to commence production at the new Brookshire-area facility later in 2026.",
      timingShape: "unknown",
      datePrecision: "unknown",
      sources: [
        {
          url: "https://example.com/source-c",
          title: "Source C",
          publisher: "example.com",
          quote: "Later in 2026 at Brookshire.",
          supportsFields: ["summary"],
        },
      ],
    })

    const { events, mergedCount } = dedupeIntraRunCatalystEventsDeterministic([
      generic,
      siteSpecific,
      timingUnknown,
    ])

    expect(mergedCount).toBe(2)
    expect(events).toHaveLength(1)
    expect(events[0]!.periodKey).toBe("2026-H2")
    expect(events[0]!.sources).toHaveLength(3)
    expect(events[0]!.title).toContain("Regional Megafactory")
  })
})
