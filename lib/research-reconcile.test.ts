import { describe, expect, test } from "bun:test"

import type { CatalystResearch } from "./research-contract"
import {
  applyCarryForwardPolicy,
  buildPriorThemeFollowUpQueries,
  getCarryForwardMaxAgeMs,
  matchPriorAndNewEvents,
  reconcileCatalystEventsWithPrior,
  selectPriorThemesForFollowUp,
  type PriorCatalystEvent,
} from "./research-reconcile"

const NOW = Date.parse("2026-06-19T12:00:00.000Z")

function baseEvent(
  overrides: Partial<CatalystResearch["events"][number]> = {},
): CatalystResearch["events"][number] {
  return {
    title: "Q3 2026 earnings release",
    summary: "Company reports Q3 results.",
    whyItMatters: "Sets guidance tone.",
    eventType: "earnings",
    timingShape: "period",
    periodKey: "2026-Q3",
    datePrecision: "quarter",
    confidence: 0.8,
    status: "likely",
    expectedImpact: "high",
    sources: [
      {
        url: "https://example.com/earnings",
        title: "Earnings preview",
        publisher: "example.com",
        quote: "Q3 earnings expected.",
        supportsFields: ["summary"],
      },
    ],
    ...overrides,
  }
}

function priorEvent(
  overrides: Partial<PriorCatalystEvent> = {},
): PriorCatalystEvent {
  return {
    ...baseEvent(),
    createdAt: NOW - 3 * 24 * 60 * 60 * 1000,
    lastVerifiedAt: NOW - 3 * 24 * 60 * 60 * 1000,
    ...overrides,
  }
}

describe("matchPriorAndNewEvents", () => {
  test("merges on shared source URL", () => {
    const prior = priorEvent({
      title: "Old acquisition rumor",
      summary: "Prior summary.",
      sources: [
        {
          url: "https://x.com/user/status/1",
          title: "Post",
          publisher: "x.com",
          quote: "Rumor text",
          supportsFields: ["summary"],
        },
      ],
    })
    const newer = baseEvent({
      title: "Acquisition talks continue",
      summary: "Updated summary.",
      sources: [
        {
          url: "https://x.com/user/status/1",
          title: "Post",
          publisher: "x.com",
          quote: "Rumor text",
          supportsFields: ["summary"],
        },
        {
          url: "https://news.example.com/story",
          title: "Story",
          publisher: "news.example.com",
          quote: "More detail",
          supportsFields: ["summary"],
        },
      ],
    })

    const { mergedNewEvents, unmatchedPrior } = matchPriorAndNewEvents(
      [prior],
      [newer],
      NOW,
    )

    expect(unmatchedPrior).toHaveLength(0)
    expect(mergedNewEvents[0]?.summary).toBe("Updated summary.")
    expect(mergedNewEvents[0]?.sources).toHaveLength(2)
    expect(mergedNewEvents[0]?.createdAt).toBe(prior.createdAt)
    expect(mergedNewEvents[0]?.lastVerifiedAt).toBe(NOW)
  })

  test("merges on periodKey and eventType", () => {
    const prior = priorEvent({
      title: "Different title wording",
      periodKey: "2026-Q3",
      eventType: "earnings",
    })
    const newer = baseEvent({
      title: "Q3 2026 earnings call",
      periodKey: "2026-Q3",
      eventType: "earnings",
      sources: [
        {
          url: "https://example.com/new-earnings",
          title: "Preview",
          publisher: "example.com",
          quote: "New source",
          supportsFields: ["summary"],
        },
      ],
    })

    const { unmatchedPrior } = matchPriorAndNewEvents([prior], [newer], NOW)

    expect(unmatchedPrior).toHaveLength(0)
  })
})

describe("applyCarryForwardPolicy", () => {
  test("drops expired timing and stale confirmed events", () => {
    const { autoDrop, autoKeep, aiReview } = applyCarryForwardPolicy(
      [
        priorEvent({
          title: "Past dated event",
          timingShape: "point",
          expectedDate: "2026-01-01",
          status: "speculative",
        }),
        priorEvent({
          title: "Confirmed but missing in new run",
          status: "confirmed",
        }),
        priorEvent({
          title: "Social rumor",
          status: "speculative",
          sources: [
            {
              url: "https://x.com/user/status/99",
              title: "Post",
              publisher: "x.com",
              quote: "Rumor",
              supportsFields: ["summary"],
            },
          ],
        }),
      ],
      NOW,
    )

    expect(autoDrop).toHaveLength(2)
    expect(autoKeep).toHaveLength(1)
    expect(aiReview).toHaveLength(0)
  })

  test("drops events beyond carry-forward TTL", () => {
    const maxAgeMs = getCarryForwardMaxAgeMs()

    const { autoDrop } = applyCarryForwardPolicy(
      [
        priorEvent({
          title: "Old rumor",
          status: "speculative",
          lastVerifiedAt: NOW - maxAgeMs - 1,
          sources: [
            {
              url: "https://x.com/user/status/100",
              title: "Post",
              publisher: "x.com",
              quote: "Old rumor",
              supportsFields: ["summary"],
            },
          ],
        }),
      ],
      NOW,
    )

    expect(autoDrop).toHaveLength(1)
  })
})

describe("reconcileCatalystEventsWithPrior", () => {
  test("returns new events unchanged when no prior events exist", async () => {
    const newEvents = [baseEvent()]

    const result = await reconcileCatalystEventsWithPrior({
      priorEvents: [],
      newEvents,
      now: NOW,
      gatewayCtx: {
        runId: "run_1",
        symbol: "TEST",
        source: "authenticated",
        strategyVersion: "catalyst-reconcile-v1",
      },
      symbol: "TEST",
    })

    expect(result.events).toHaveLength(1)
    expect(result.stats.priorEventCount).toBe(0)
    expect(result.stats.carriedForwardCount).toBe(0)
  })

  test("carries forward unmatched social speculative events", async () => {
    const prior = priorEvent({
      title: "Acquisition rumor on X",
      status: "speculative",
      sources: [
        {
          url: "https://x.com/user/status/42",
          title: "Post",
          publisher: "x.com",
          quote: "Takeover chatter",
          supportsFields: ["summary"],
        },
      ],
    })

    const result = await reconcileCatalystEventsWithPrior({
      priorEvents: [prior],
      newEvents: [],
      now: NOW,
      gatewayCtx: {
        runId: "run_1",
        symbol: "TEST",
        source: "authenticated",
        strategyVersion: "catalyst-reconcile-v1",
      },
      symbol: "TEST",
      providerReports: [],
    })

    expect(result.events).toHaveLength(1)
    expect(result.events[0]?.carriedForward).toBe(true)
    expect(result.events[0]?.sources[0]?.provenance).toBe(
      "prior_run_carryforward",
    )
    expect(result.stats.carriedForwardCount).toBe(1)
  })
})

describe("follow-up seeding helpers", () => {
  test("selectPriorThemesForFollowUp prefers speculative recent events", () => {
    const themes = selectPriorThemesForFollowUp([
      priorEvent({
        title: "Confirmed event",
        status: "confirmed",
        lastVerifiedAt: NOW,
      }),
      priorEvent({
        title: "Social rumor",
        status: "speculative",
        lastVerifiedAt: NOW - 1_000,
      }),
    ])

    expect(themes[0]).toContain("Social rumor")
  })

  test("buildPriorThemeFollowUpQueries caps output", () => {
    const queries = buildPriorThemeFollowUpQueries(
      "TEST",
      "Test Co",
      ["Theme one", "Theme two", "Theme three"],
      2,
    )

    expect(queries).toHaveLength(2)
    expect(queries[0]).toContain("Test Co (TEST)")
  })
})
