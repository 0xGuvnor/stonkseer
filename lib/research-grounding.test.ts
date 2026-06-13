import { describe, expect, test } from "bun:test"

import type { CatalystResearch } from "./research-contract"
import { verifyAndFilterEvents } from "./research-grounding"
import type { SourceSnippet } from "./research-discovery"

const baseEvent: CatalystResearch["events"][number] = {
  title: "EU FSD approval path",
  summary: "Regulators may rule on supervised autonomy in 2026.",
  whyItMatters: "Unlocks revenue optionality in a large auto market.",
  eventType: "regulatory",
  timingShape: "unknown",
  datePrecision: "unknown",
  confidence: 0.6,
  status: "likely",
  expectedImpact: "high",
  sources: [],
}

describe("verifyAndFilterEvents", () => {
  const snippets: SourceSnippet[] = [
    {
      url: "https://example.com/fsd-eu",
      title: "FSD Europe timeline",
      publisher: "example.com",
      quote:
        "European regulators are reviewing Tesla FSD supervised autonomy for potential approval in late 2026 according to trade press.",
      provenance: "tool_excerpt",
    },
  ]

  test("keeps events and repairs paraphrased quotes from matching snippet URLs", () => {
    const result = verifyAndFilterEvents(
      [
        {
          ...baseEvent,
          sources: [
            {
              url: "https://example.com/fsd-eu",
              title: "Wrong title",
              publisher: "wrong.com",
              quote: "Completely different paraphrase with no overlap.",
              supportsFields: ["summary"],
            },
          ],
        },
      ],
      snippets,
    )

    expect(result.events).toHaveLength(1)
    expect(result.droppedCount).toBe(0)
    expect(result.events[0]?.sources[0]?.quote).toBe(snippets[0]!.quote)
    expect(result.events[0]?.sources[0]?.provenance).toBe("evidence_snippet")
    expect(result.repairedSourceCount).toBe(1)
    expect(result.reportDerivedSourceCount).toBe(0)
  })

  test("keeps report-derived sources when the URL was seen by a provider", () => {
    const result = verifyAndFilterEvents(
      [
        {
          ...baseEvent,
          sources: [
            {
              url: "https://news.example.org/optimus-ramp",
              title: "Optimus production ramp",
              publisher: "news.example.org",
              quote:
                "The report says high-volume Optimus manufacturing is targeted for late 2026.",
              supportsFields: ["summary"],
            },
          ],
        },
      ],
      snippets,
      ["https://news.example.org/optimus-ramp"],
    )

    expect(result.events).toHaveLength(1)
    expect(result.droppedCount).toBe(0)
    expect(result.events[0]?.sources[0]?.provenance).toBe("report_derived")
    expect(result.events[0]?.sources[0]?.quote).toContain(
      "high-volume Optimus manufacturing",
    )
    expect(result.reportDerivedSourceCount).toBe(1)
  })

  test("drops events when no source URL matched snippets or seen URLs", () => {
    const result = verifyAndFilterEvents(
      [
        {
          ...baseEvent,
          sources: [
            {
              url: "https://evil.com/not-in-evidence",
              title: "Fake",
              publisher: "evil.com",
              quote: snippets[0]!.quote,
              supportsFields: ["summary"],
            },
          ],
        },
      ],
      snippets,
      ["https://news.example.org/optimus-ramp"],
    )

    expect(result.events).toHaveLength(0)
    expect(result.droppedCount).toBe(1)
  })

  test("keeps the event when at least one source survives, dropping unseen sources", () => {
    const result = verifyAndFilterEvents(
      [
        {
          ...baseEvent,
          sources: [
            {
              url: "https://evil.com/not-in-evidence",
              title: "Fake",
              publisher: "evil.com",
              quote: "Hallucinated quote.",
              supportsFields: ["summary"],
            },
            {
              url: "https://example.com/fsd-eu",
              title: "FSD Europe timeline",
              publisher: "example.com",
              quote: "Paraphrase",
              supportsFields: ["summary"],
            },
          ],
        },
      ],
      snippets,
    )

    expect(result.events).toHaveLength(1)
    expect(result.events[0]?.sources).toHaveLength(1)
    expect(result.events[0]?.sources[0]?.url).toBe(
      "https://example.com/fsd-eu",
    )
  })
})
