import { describe, expect, test } from "bun:test"

import {
  catalystResearchAiSchema,
  normalizeDatePrecision,
} from "./research-contract"

describe("normalizeDatePrecision", () => {
  test("passes through valid values", () => {
    expect(normalizeDatePrecision("exact")).toBe("exact")
    expect(normalizeDatePrecision("quarter")).toBe("quarter")
  })

  test("maps common model synonyms", () => {
    expect(normalizeDatePrecision("year")).toBe("unknown")
    expect(normalizeDatePrecision("annual")).toBe("unknown")
    expect(normalizeDatePrecision("day")).toBe("exact")
    expect(normalizeDatePrecision("quarterly")).toBe("quarter")
  })

  test("accepts year-like values through AI schema preprocess", () => {
    const parsed = catalystResearchAiSchema.parse({
      companyName: null,
      exchange: null,
      events: [
        {
          title: "Test",
          summary: "Summary",
          whyItMatters: "Why",
          eventType: "corporate",
          timingShape: "period",
          expectedDate: null,
          windowStart: null,
          windowEnd: null,
          periodKey: "2026",
          timingQualifier: null,
          datePrecision: "year",
          confidence: 0.6,
          status: "likely",
          expectedImpact: "medium",
          sources: [
            {
              url: "https://example.com/story",
              title: "Story",
              publisher: "example.com",
              publishedAt: null,
              quote: "Quote",
              supportsFields: ["summary"],
            },
          ],
        },
      ],
    })

    expect(parsed.events[0]?.datePrecision).toBe("unknown")
  })
})
