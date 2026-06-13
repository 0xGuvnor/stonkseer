import { describe, expect, test } from "bun:test"

import type { CatalystResearch } from "./research-contract"
import {
  buildResearchHorizonEnd,
  buildResearchRunDate,
  eventTimingLabel,
  isWithinResearchHorizon,
  normalizeCatalystEventTiming,
  parseAnchorDate,
  parsePeriodKey,
  parseSortAnchor,
} from "./catalyst-timing"
import { daysUntilAnchor } from "./portfolio-catalyst-utils"

const baseEventFields = {
  title: "Test catalyst",
  summary: "Summary",
  whyItMatters: "Why",
  eventType: "product" as const,
  datePrecision: "quarter" as const,
  confidence: 0.7,
  status: "likely" as const,
  expectedImpact: "medium" as const,
  sources: [
    {
      url: "https://example.com/story",
      title: "Story",
      publisher: "example.com",
      quote: "Quote",
      supportsFields: ["summary"],
    },
  ],
}

const fixtureNow = Date.parse("2025-06-13T12:00:00Z")

function normalizeOptions(now: number) {
  return {
    researchHorizonEnd: buildResearchHorizonEnd(now),
    researchRunDate: buildResearchRunDate(now),
  }
}

describe("parsePeriodKey", () => {
  test("parses year", () => {
    const parsed = parsePeriodKey("2026")
    expect(parsed?.label).toBe("2026")
    expect(parsed?.anchorStart).toEqual(new Date(2026, 0, 1))
  })

  test("parses quarter", () => {
    const parsed = parsePeriodKey("2026-Q3")
    expect(parsed?.label).toBe("Q3 2026")
    expect(parsed?.anchorStart).toEqual(new Date(2026, 6, 1))
  })

  test("parses half", () => {
    const parsed = parsePeriodKey("2026-H2")
    expect(parsed?.label).toBe("H2 2026")
    expect(parsed?.anchorStart).toEqual(new Date(2026, 6, 1))
  })

  test("parses month", () => {
    const parsed = parsePeriodKey("2026-03")
    expect(parsed?.label).toBe("Mar 2026")
    expect(parsed?.anchorStart).toEqual(new Date(2026, 2, 1))
  })
})

describe("normalizeCatalystEventTiming", () => {
  const options = normalizeOptions(fixtureNow)

  test("strips research horizon windowEnd and coerces closed_window to from", () => {
    const event: CatalystResearch["events"][number] = {
      ...baseEventFields,
      timingShape: "closed_window",
      windowStart: "2025-07-01",
      windowEnd: options.researchHorizonEnd,
    }

    const normalized = normalizeCatalystEventTiming(event, options)

    expect(normalized.timingShape).toBe("from")
    expect(normalized.windowStart).toBe("2025-07-01")
    expect(normalized.windowEnd).toBeUndefined()
  })

  test("strips research horizon windowEnd and coerces to open when no start", () => {
    const event: CatalystResearch["events"][number] = {
      ...baseEventFields,
      timingShape: "closed_window",
      windowEnd: options.researchHorizonEnd,
    }

    const normalized = normalizeCatalystEventTiming(event, options)

    expect(normalized.timingShape).toBe("open")
    expect(normalized.windowEnd).toBeUndefined()
  })

  test("strips run-date windowStart for open events", () => {
    const event: CatalystResearch["events"][number] = {
      ...baseEventFields,
      timingShape: "open",
      windowStart: options.researchRunDate,
    }

    const normalized = normalizeCatalystEventTiming(event, options)

    expect(normalized.timingShape).toBe("open")
    expect(normalized.windowStart).toBeUndefined()
  })

  test("preserves past windowStart for open events", () => {
    const event: CatalystResearch["events"][number] = {
      ...baseEventFields,
      timingShape: "open",
      windowStart: "2025-03-01",
    }

    const normalized = normalizeCatalystEventTiming(event, options)

    expect(normalized.timingShape).toBe("open")
    expect(normalized.windowStart).toBe("2025-03-01")
  })

  test("coerces from with past start to open", () => {
    const event: CatalystResearch["events"][number] = {
      ...baseEventFields,
      timingShape: "from",
      windowStart: "2025-03-01",
    }

    const normalized = normalizeCatalystEventTiming(event, options)

    expect(normalized.timingShape).toBe("open")
    expect(normalized.windowStart).toBe("2025-03-01")
  })

  test("drops disallowed fields per shape", () => {
    const event: CatalystResearch["events"][number] = {
      ...baseEventFields,
      timingShape: "period",
      periodKey: "2026-Q3",
      windowStart: "2026-07-01",
      windowEnd: "2026-09-30",
    }

    const normalized = normalizeCatalystEventTiming(event, options)

    expect(normalized.periodKey).toBe("2026-Q3")
    expect(normalized.windowStart).toBeUndefined()
    expect(normalized.windowEnd).toBeUndefined()
  })
})

describe("eventTimingLabel", () => {
  test("labels each timing shape", () => {
    expect(
      eventTimingLabel(
        {
          timingShape: "point",
          expectedDate: "2026-11-12",
          datePrecision: "exact",
        },
        fixtureNow,
      ),
    ).toBe("12th Nov 2026")

    expect(
      eventTimingLabel(
        {
          timingShape: "closed_window",
          windowStart: "2026-03-01",
          windowEnd: "2026-05-31",
          datePrecision: "quarter",
        },
        fixtureNow,
      ),
    ).toBe("1st Mar 2026 - 31st May 2026")

    expect(
      eventTimingLabel(
        {
          timingShape: "from",
          windowStart: "2026-01-15",
          datePrecision: "month",
        },
        fixtureNow,
      ),
    ).toBe("After 15th Jan 2026")

    expect(
      eventTimingLabel(
        {
          timingShape: "by",
          windowEnd: "2026-12-31",
          datePrecision: "exact",
        },
        fixtureNow,
      ),
    ).toBe("By 31st Dec 2026")

    expect(
      eventTimingLabel(
        {
          timingShape: "period",
          periodKey: "2026-Q3",
          datePrecision: "quarter",
        },
        fixtureNow,
      ),
    ).toBe("Q3 2026")

    expect(
      eventTimingLabel(
        {
          timingShape: "open",
          windowStart: "2026-04-01",
          datePrecision: "quarter",
        },
        fixtureNow,
      ),
    ).toBe("From 1st Apr 2026 (ongoing)")

    expect(
      eventTimingLabel(
        {
          timingShape: "unknown",
          datePrecision: "unknown",
        },
        fixtureNow,
      ),
    ).toBe("Timing unknown")
  })

  test("uses Since for past open starts", () => {
    expect(
      eventTimingLabel(
        {
          timingShape: "open",
          windowStart: "2025-03-01",
          datePrecision: "quarter",
        },
        fixtureNow,
      ),
    ).toBe("Since 1st Mar 2025 (ongoing)")

    expect(
      eventTimingLabel(
        {
          timingShape: "open",
          periodKey: "2025-H1",
          datePrecision: "half",
        },
        fixtureNow,
      ),
    ).toBe("Since H1 2025 (ongoing)")
  })
})

describe("parseAnchorDate", () => {
  test("prefers expectedDate then windowStart then periodKey", () => {
    expect(
      parseAnchorDate({
        timingShape: "point",
        expectedDate: "2026-05-01",
        windowStart: "2026-01-01",
        periodKey: "2026-Q1",
        datePrecision: "exact",
      }),
    ).toEqual(new Date(2026, 4, 1))

    expect(
      parseAnchorDate({
        timingShape: "period",
        periodKey: "2026-Q2",
        datePrecision: "quarter",
      }),
    ).toEqual(new Date(2026, 3, 1))
  })
})

describe("parseSortAnchor", () => {
  test("uses today for open events with past starts", () => {
    expect(
      parseSortAnchor(
        {
          timingShape: "open",
          windowStart: "2025-03-01",
          datePrecision: "quarter",
        },
        fixtureNow,
      ),
    ).toEqual(new Date(2025, 5, 13))
  })

  test("keeps future from anchors", () => {
    expect(
      parseSortAnchor(
        {
          timingShape: "from",
          windowStart: "2026-01-15",
          datePrecision: "month",
        },
        fixtureNow,
      ),
    ).toEqual(new Date(2026, 0, 15))
  })
})

describe("isWithinResearchHorizon", () => {
  test("includes open events with start inside horizon", () => {
    expect(
      isWithinResearchHorizon(
        {
          timingShape: "open",
          windowStart: "2025-08-01",
          datePrecision: "quarter",
        },
        fixtureNow,
      ),
    ).toBe(true)
  })

  test("includes open events already underway with past start", () => {
    expect(
      isWithinResearchHorizon(
        {
          timingShape: "open",
          windowStart: "2025-03-01",
          datePrecision: "quarter",
        },
        fixtureNow,
      ),
    ).toBe(true)
  })

  test("excludes by deadlines after horizon", () => {
    expect(
      isWithinResearchHorizon(
        {
          timingShape: "by",
          windowEnd: "2027-01-01",
          datePrecision: "exact",
        },
        fixtureNow,
      ),
    ).toBe(false)
  })

  test("includes by deadlines within horizon", () => {
    expect(
      isWithinResearchHorizon(
        {
          timingShape: "by",
          windowEnd: "2026-03-01",
          datePrecision: "exact",
        },
        fixtureNow,
      ),
    ).toBe(true)
  })

  test("excludes unknown timing from upcoming lists", () => {
    expect(
      isWithinResearchHorizon(
        {
          timingShape: "unknown",
          datePrecision: "unknown",
        },
        fixtureNow,
      ),
    ).toBe(false)
  })

  test("excludes period events beyond horizon", () => {
    expect(
      isWithinResearchHorizon(
        {
          timingShape: "period",
          periodKey: "2027-Q1",
          datePrecision: "quarter",
        },
        fixtureNow,
      ),
    ).toBe(false)
  })
})

describe("daysUntilAnchor", () => {
  test("returns 0 for open events already underway", () => {
    expect(
      daysUntilAnchor(
        {
          _id: "events:1" as never,
          title: "Rollout",
          summary: "Summary",
          whyItMatters: "Why",
          eventType: "product",
          timingShape: "open",
          windowStart: "2025-03-01",
          datePrecision: "quarter",
          confidence: 0.7,
          expectedImpact: "medium",
          sources: [],
        },
        fixtureNow,
      ),
    ).toBe(0)
  })
})
