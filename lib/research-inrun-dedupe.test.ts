import { describe, expect, test } from "bun:test"

import type { CatalystResearch } from "./research-contract"
import {
  dedupeIntraRunCatalystEventsDeterministic,
  extractProceedingIds,
} from "./research-inrun-dedupe"

type CatalystEvent = CatalystResearch["events"][number]

function baseEvent(
  overrides: Partial<CatalystEvent> = {},
): CatalystEvent {
  return {
    title: "Placeholder catalyst",
    summary: "Summary text.",
    whyItMatters: "Market relevance.",
    eventType: "regulatory",
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

describe("extractProceedingIds", () => {
  test("extracts NHTSA EA numbers", () => {
    const ids = extractProceedingIds(
      "NHTSA opened engineering analysis EA26002 covering 3.2M vehicles.",
    )

    expect(ids.has("EA26002")).toBe(true)
  })
})

describe("dedupeIntraRunCatalystEventsDeterministic", () => {
  test("merges NHTSA FSD visibility duplicate rows from the same run", () => {
    const probeOutcome = baseEvent({
      title: "NHTSA FSD Visibility Probe Outcome",
      summary:
        "NHTSA engineering analysis EA26002 covers roughly 3.2M Tesla vehicles over FSD visibility concerns.",
      timingShape: "unknown",
      sources: [
        {
          url: "https://tesorb.com/nhtsa-fsd-probe",
          title: "Probe outcome",
          publisher: "tesorb.com",
          quote: "EA26002 covers 3.2M vehicles.",
          supportsFields: ["summary"],
        },
      ],
    })

    const engineeringAnalysis = baseEvent({
      title: "NHTSA Engineering Analysis of FSD for Visibility Issues",
      summary:
        "Agency opened an engineering analysis after nine crashes tied to degraded vision in FSD, affecting 3.2M vehicles.",
      timingShape: "open",
      windowStart: "2026-01-15",
      sources: [
        {
          url: "https://static.nhtsa.gov/ea26002",
          title: "EA26002 notice",
          publisher: "nhtsa.gov",
          quote: "Engineering analysis EA26002 for FSD visibility.",
          supportsFields: ["summary"],
        },
      ],
    })

    const { events, mergedCount } = dedupeIntraRunCatalystEventsDeterministic([
      probeOutcome,
      engineeringAnalysis,
    ])

    expect(mergedCount).toBe(1)
    expect(events).toHaveLength(1)
    expect(events[0]!.timingShape).toBe("open")
    expect(events[0]!.sources).toHaveLength(2)
    expect(events[0]!.summary).toContain("3.2M")
  })

  test("does not merge two different NHTSA actions with distinct EA IDs", () => {
    const ea26002 = baseEvent({
      title: "NHTSA EA26002 FSD visibility analysis",
      summary: "Engineering analysis EA26002 for FSD visibility.",
      sources: [
        {
          url: "https://nhtsa.gov/ea26002",
          title: "EA26002",
          publisher: "nhtsa.gov",
          quote: "EA26002",
          supportsFields: ["summary"],
        },
      ],
    })

    const ea27001 = baseEvent({
      title: "NHTSA EA27001 steering probe",
      summary: "Separate steering investigation EA27001.",
      sources: [
        {
          url: "https://nhtsa.gov/ea27001",
          title: "EA27001",
          publisher: "nhtsa.gov",
          quote: "EA27001",
          supportsFields: ["summary"],
        },
      ],
    })

    const { events, mergedCount } = dedupeIntraRunCatalystEventsDeterministic([
      ea26002,
      ea27001,
    ])

    expect(mergedCount).toBe(0)
    expect(events).toHaveLength(2)
  })

  test("does not merge regulatory rows with conflicting recall dates", () => {
    const marchRecall = baseEvent({
      title: "NHTSA recall for brake module",
      summary: "Recall scheduled for March 2026 affecting 120k vehicles.",
      timingShape: "by",
      expectedDate: "2026-03-15",
      sources: [
        {
          url: "https://nhtsa.gov/recall-march",
          title: "March recall",
          publisher: "nhtsa.gov",
          quote: "March 2026 recall.",
          supportsFields: ["summary"],
        },
      ],
    })

    const juneRecall = baseEvent({
      title: "NHTSA recall for seat sensor",
      summary: "Separate recall expected June 2026 for seat sensors.",
      timingShape: "by",
      expectedDate: "2026-06-30",
      sources: [
        {
          url: "https://nhtsa.gov/recall-june",
          title: "June recall",
          publisher: "nhtsa.gov",
          quote: "June 2026 recall.",
          supportsFields: ["summary"],
        },
      ],
    })

    const { events, mergedCount } = dedupeIntraRunCatalystEventsDeterministic([
      marchRecall,
      juneRecall,
    ])

    expect(mergedCount).toBe(0)
    expect(events).toHaveLength(2)
  })

  test("keeps distinct earnings periodKey rows separate", () => {
    const q2 = baseEvent({
      title: "Q2 2026 earnings release",
      eventType: "earnings",
      timingShape: "period",
      periodKey: "2026-Q2",
      datePrecision: "quarter",
      sources: [
        {
          url: "https://example.com/q2-earnings",
          title: "Q2 preview",
          publisher: "example.com",
          quote: "Q2 earnings.",
          supportsFields: ["summary"],
        },
      ],
    })

    const q3 = baseEvent({
      title: "Q3 2026 earnings release",
      eventType: "earnings",
      timingShape: "period",
      periodKey: "2026-Q3",
      datePrecision: "quarter",
      sources: [
        {
          url: "https://example.com/q3-earnings",
          title: "Q3 preview",
          publisher: "example.com",
          quote: "Q3 earnings.",
          supportsFields: ["summary"],
        },
      ],
    })

    const { events, mergedCount } = dedupeIntraRunCatalystEventsDeterministic([
      q2,
      q3,
    ])

    expect(mergedCount).toBe(0)
    expect(events).toHaveLength(2)
  })
})
