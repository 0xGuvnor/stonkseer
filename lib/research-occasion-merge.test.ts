import { describe, expect, test } from "bun:test"

import {
  formatResearchCatalystThreadCoherenceBlock,
  formatResearchOccasionExtractionSelfCheck,
  formatResearchOccasionMergeBlock,
  formatResearchOccasionReportBlock,
} from "./research-occasion-merge"
import { formatResearchTimingExtractionBlock } from "./research-themes"

describe("formatResearchOccasionMergeBlock", () => {
  test("uses occasion-general merge language", () => {
    const block = formatResearchOccasionMergeBlock()

    expect(block).toContain("same dated or named real-world occasion")
    expect(block).toContain("production start")
    expect(block).toContain("not separate rows")
    expect(block).not.toContain("Megapack")
  })
})

describe("formatResearchCatalystThreadCoherenceBlock", () => {
  test("keeps roundup rows on one catalyst thread", () => {
    const block = formatResearchCatalystThreadCoherenceBlock()

    expect(block).toContain("Roundup articles can support multiple catalyst rows")
    expect(block).toContain("one catalyst thread")
    expect(block).toContain("title, timing fields, summary")
    expect(block).toContain("do not take a title from one section")
    expect(block).toContain("facility or site named in the title")
    expect(block).toContain("Title and whyItMatters must address the same milestone")
    expect(block).toContain("Do not mix covered fiscal/report periods")
  })

  test("allows ongoing starts without stale one-time events", () => {
    const block = formatResearchCatalystThreadCoherenceBlock()

    expect(block).toContain("Past dates are valid")
    expect(block).toContain("active ongoing catalyst")
    expect(block).toContain("stale one-time events")
    expect(block).toContain("source-backed future milestone")
  })
})

describe("formatResearchOccasionReportBlock", () => {
  test("asks hosted search for one entry per occasion", () => {
    const block = formatResearchOccasionReportBlock()

    expect(block).toContain("one catalyst entry")
    expect(block).toContain("Do not list the same production start")
  })
})

describe("formatResearchOccasionExtractionSelfCheck", () => {
  test("extends self-check beyond regulatory proceedings", () => {
    const block = formatResearchOccasionExtractionSelfCheck()

    expect(block).toContain("same dated or named occasion")
    expect(block).toContain("not only regulatory proceedings")
    expect(block).toContain("timingShape must not be unknown")
    expect(block).toContain("title and whyItMatters disagree")
    expect(block).toContain("timingQualifier")
  })
})

describe("formatResearchTimingExtractionBlock", () => {
  test("documents timingQualifier extraction", () => {
    const block = formatResearchTimingExtractionBlock()

    expect(block).toContain("timingQualifier early, mid, or late")
    expect(block).toContain("early July 2026")
  })
})
