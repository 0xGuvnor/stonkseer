import { describe, expect, test } from "bun:test"

import {
  formatResearchBreadthExtractionBlock,
  formatResearchTimingExtractionBlock,
  formatResearchTimingReportBlock,
} from "./research-themes"

describe("formatResearchBreadthExtractionBlock", () => {
  test("includes cadence and date-window guidance", () => {
    const block = formatResearchBreadthExtractionBlock()

    expect(block).toContain("cadence")
    expect(block).toContain("date windows")
  })
})

describe("formatResearchTimingExtractionBlock", () => {
  test("requires structured timing fields over summary prose", () => {
    const block = formatResearchTimingExtractionBlock()

    expect(block).toContain("prose in summary alone does not satisfy timing")
    expect(block).toContain("timingShape")
    expect(block).toContain("periodKey")
  })

  test("anchors publication catalysts to release month, not covered quarter", () => {
    const block = formatResearchTimingExtractionBlock()

    expect(block).toContain("2026-07")
    expect(block).toContain("not 2026-Q2")
    expect(block).toContain("Vehicle Production & Deliveries Report")
    expect(block).toContain("Publication and disclosure catalysts")
  })

  test("reserves YYYY-Qn for period-activity milestones", () => {
    const block = formatResearchTimingExtractionBlock()

    expect(block).toContain("YYYY-Qn")
    expect(block).toContain("activity during that quarter")
  })

  test("reserves unknown only when no anchor exists", () => {
    const block = formatResearchTimingExtractionBlock()

    expect(block).toContain("Reserve timingShape unknown only when")
    expect(block).toContain("timing unclear")
  })

  test("clarifies anti-inference scope", () => {
    const block = formatResearchTimingExtractionBlock()

    expect(block).toContain("12-month research horizon")
    expect(block).toContain("Allowed: extracting 2026-07")
  })

  test("covers multi-quarter span guidance", () => {
    const block = formatResearchTimingExtractionBlock()

    expect(block).toContain("Multi-quarter spans")
    expect(block).toContain("Q3–Q4 2026")
    expect(block).toContain("2026-H2")
  })
})

describe("formatResearchTimingReportBlock", () => {
  test("asks hosted search to state publication month prominently", () => {
    const block = formatResearchTimingReportBlock()

    expect(block).toContain("publication month")
    expect(block).toContain("vehicle production/delivery reports")
    expect(block).toContain("timing unclear")
  })
})
