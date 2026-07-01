import { describe, expect, test } from "bun:test"

import type { CatalystResearch } from "./research-contract"
import { filterThreadCoherentCatalystEvents } from "./research-thread-coherence"

type CatalystEvent = CatalystResearch["events"][number]

function baseEvent(overrides: Partial<CatalystEvent> = {}): CatalystEvent {
  return {
    title: "Q2 2026 Vehicle Production and Deliveries Report",
    summary:
      "The company is expected to publish Q2 2026 production and delivery results in early July 2026.",
    whyItMatters:
      "A beat or miss versus consensus would show whether vehicle demand is recovering.",
    eventType: "corporate",
    timingShape: "period",
    periodKey: "2026-07",
    timingQualifier: "early",
    datePrecision: "month",
    confidence: 0.8,
    status: "likely",
    expectedImpact: "high",
    sources: [
      {
        url: "https://example.com/report",
        title: "Report",
        publisher: "example.com",
        quote: "Q2 production and delivery report expected in early July 2026.",
        supportsFields: ["summary", "periodKey"],
      },
    ],
    ...overrides,
  }
}

describe("filterThreadCoherentCatalystEvents", () => {
  test("keeps coherent vehicle production and delivery report rows", () => {
    const result = filterThreadCoherentCatalystEvents([baseEvent()])

    expect(result.events).toHaveLength(1)
    expect(result.droppedCount).toBe(0)
  })

  test("drops vehicle report rows with earnings-calendar body text", () => {
    const result = filterThreadCoherentCatalystEvents([
      baseEvent({
        summary:
          "Forecast services place the Q3 2026 earnings release in late October, with Wall Street Horizon showing October 21 after market close.",
        whyItMatters:
          "Earnings and guidance can reprice the stock through margin, free-cash-flow, and execution updates.",
        sources: [
          {
            url: "https://example.com/earnings",
            title: "Earnings calendar",
            publisher: "example.com",
            quote: "Q3 earnings expected after market close in October 2026.",
            supportsFields: ["summary"],
          },
        ],
      }),
    ])

    expect(result.events).toHaveLength(0)
    expect(result.dropReasons[0]).toContain("earnings-calendar body text")
  })

  test("drops vehicle report rows whose covered quarter conflicts with summary", () => {
    const result = filterThreadCoherentCatalystEvents([
      baseEvent({
        title: "Q3 2026 Vehicle Deliveries & Production Report",
        summary:
          "The company is expected to report Q2 2026 global vehicle deliveries around July 2, 2026.",
      }),
    ])

    expect(result.events).toHaveLength(0)
    expect(result.dropReasons[0]).toContain("covered quarter conflicts")
  })

  test("drops earnings rows whose reported quarter conflicts with summary", () => {
    const result = filterThreadCoherentCatalystEvents([
      baseEvent({
        title: "Q1 2027 Earnings Release & Conference Call",
        summary:
          "The Q4/full-year 2026 earnings call is forecast for late January 2027.",
        whyItMatters:
          "Full-year earnings include capex, factory-ramp, and software-monetization commentary.",
        eventType: "earnings",
        timingShape: "point",
        expectedDate: "2027-04-20",
        periodKey: undefined,
        timingQualifier: undefined,
        datePrecision: "exact",
      }),
    ])

    expect(result.events).toHaveLength(0)
    expect(result.dropReasons[0]).toContain("earnings quarter conflicts")
  })

  test("drops production rows whose title month conflicts with body timing", () => {
    const result = filterThreadCoherentCatalystEvents([
      baseEvent({
        title: "Regional Plant production ramp to about 6,200 vehicles per week in July",
        summary:
          "The company plans to raise output to 7,500 vehicles per week starting in October 2026.",
        whyItMatters:
          "A concrete throughput increase supports regional utilization.",
        eventType: "corporate",
      }),
    ])

    expect(result.events).toHaveLength(0)
    expect(result.dropReasons[0]).toContain("title timing conflicts")
  })

  test("drops production rows whose title capacity conflicts with summary capacity", () => {
    const result = filterThreadCoherentCatalystEvents([
      baseEvent({
        title:
          "Regional Plant production ramp to about 6,200 vehicles per week",
        summary:
          "The company plans to raise output to 7,500 vehicles per week in the same ramp window.",
        whyItMatters:
          "A concrete throughput increase supports regional utilization.",
        eventType: "corporate",
      }),
    ])

    expect(result.events).toHaveLength(0)
    expect(result.dropReasons[0]).toContain("title capacity conflicts")
  })

  test("drops production rows whose title program is absent from summary and why", () => {
    const result = filterThreadCoherentCatalystEvents([
      baseEvent({
        title: "Commercial Truck Volume Production Ramp at Nevada Factory",
        summary:
          "The new Houston-area energy storage factory is slated to begin battery block deliveries in the second half of 2026.",
        whyItMatters:
          "Reaching meaningful weekly volumes would show that the robotaxi fleet strategy is moving from concept to scale.",
        eventType: "product",
        timingShape: "period",
        periodKey: "2026-H2",
        timingQualifier: undefined,
        datePrecision: "half",
      }),
    ])

    expect(result.events).toHaveLength(0)
    expect(result.dropReasons[0]).toContain("title program is absent")
  })

  test("drops production rows when title and body overlap only on issuer tokens", () => {
    const result = filterThreadCoherentCatalystEvents([
      baseEvent({
        title: "Example Motors Commercial Truck Production Ramp at Nevada Factory",
        summary:
          "Example Motors plans energy storage block deliveries from a Houston-area factory in H2 2026.",
        whyItMatters:
          "Example Motors could use the launch to diversify revenue away from vehicles.",
        eventType: "product",
        timingShape: "period",
        periodKey: "2026-H2",
        timingQualifier: undefined,
        datePrecision: "half",
      }),
    ])

    expect(result.events).toHaveLength(0)
    expect(result.dropReasons[0]).toContain("title program is absent")
  })

  test("drops agency proceeding rows whose summary describes a different body", () => {
    const result = filterThreadCoherentCatalystEvents([
      baseEvent({
        title:
          "NHTSA PE25012 and AQ25002 FSD Traffic Violations and Crash-Reporting Compliance Scrutiny",
        summary:
          "California regulators clarified that the service remains under a chauffeur-style permit and the company has not applied for the California DMV deployment permit.",
        whyItMatters:
          "Open proceedings raise the probability of future enforcement action.",
        eventType: "regulatory",
        timingShape: "open",
        windowStart: "2026-03-18",
        periodKey: undefined,
        timingQualifier: undefined,
        datePrecision: "exact",
      }),
    ])

    expect(result.events).toHaveLength(0)
    expect(result.dropReasons[0]).toContain("agency or proceeding")
  })

  test("drops agency proceeding rows with different bodies even without proceeding ids", () => {
    const result = filterThreadCoherentCatalystEvents([
      baseEvent({
        title: "NHTSA FSD Crash-Reporting Compliance Investigation",
        summary:
          "California regulators clarified that commercial robotaxi service still needs a DMV deployment permit.",
        whyItMatters:
          "A denied permit could delay the company's paid autonomy rollout.",
        eventType: "regulatory",
        timingShape: "open",
        windowStart: "2026-03-18",
        periodKey: undefined,
        timingQualifier: undefined,
        datePrecision: "exact",
      }),
    ])

    expect(result.events).toHaveLength(0)
    expect(result.dropReasons[0]).toContain("agency or proceeding")
  })

  test("keeps agency proceeding rows that cite the same agency in summary", () => {
    const result = filterThreadCoherentCatalystEvents([
      baseEvent({
        title:
          "NHTSA PE25012 FSD Traffic Violations and Crash-Reporting Compliance Scrutiny",
        summary:
          "NHTSA opened PE25012 to review FSD traffic violations and crash-reporting compliance.",
        whyItMatters:
          "Enforcement action could limit commercial autonomy claims.",
        eventType: "regulatory",
        timingShape: "open",
        windowStart: "2026-03-18",
        periodKey: undefined,
        timingQualifier: undefined,
        datePrecision: "exact",
      }),
    ])

    expect(result.events).toHaveLength(1)
  })
})
