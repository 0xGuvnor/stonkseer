import { describe, expect, test } from "bun:test"

import {
  formatResearchOccasionExtractionSelfCheck,
  formatResearchOccasionMergeBlock,
  formatResearchOccasionReportBlock,
} from "./research-occasion-merge"

describe("formatResearchOccasionMergeBlock", () => {
  test("uses occasion-general merge language", () => {
    const block = formatResearchOccasionMergeBlock()

    expect(block).toContain("same dated or named real-world occasion")
    expect(block).toContain("production start")
    expect(block).toContain("not separate rows")
    expect(block).not.toContain("Megapack")
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
  })
})
