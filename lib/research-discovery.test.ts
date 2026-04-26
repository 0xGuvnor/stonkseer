import { describe, expect, test } from "bun:test"

import {
  buildResearchCandidates,
  buildSearchQueries,
  selectBalancedSearchPlan,
  type SourceSnippet,
} from "./research-discovery"

const jan2026 = Date.UTC(2026, 0, 15)

describe("research discovery planning", () => {
  test("keeps branded event discovery in the anonymous search budget", () => {
    const plan = buildSearchQueries(
      "FIG",
      "Figma, Inc.",
      "https://www.figma.com",
      jan2026,
      "Technology",
    )
    const balanced = selectBalancedSearchPlan(plan, 10)
    const buckets = new Set(balanced.map((query) => query.bucket))

    expect(buckets).toContain("official")
    expect(buckets).toContain("branded_event")
    expect(buckets).toContain("market_news")
    expect(buckets).toContain("product")
    expect(buckets).toContain("raw_symbol")
    expect(
      balanced.some((query) =>
        /conference|keynote|event|registration/.test(query.query),
      ),
    ).toBe(true)
  })

  test("adds regulatory timeline searches for nuclear energy companies", () => {
    const plan = buildSearchQueries(
      "SMR",
      "NuScale Power Corporation",
      "https://www.nuscalepower.com",
      jan2026,
      "Nuclear clean energy reactor",
    )
    const balanced = selectBalancedSearchPlan(plan, 10)
    const plannedRegulatoryQueries = plan
      .filter((query) => query.bucket === "regulatory")
      .map((query) => query.query.toLowerCase())
    const balancedBuckets = new Set(balanced.map((query) => query.bucket))

    expect(balancedBuckets).toContain("regulatory")
    expect(plannedRegulatoryQueries.length).toBeGreaterThan(0)
    expect(plannedRegulatoryQueries.join(" ")).toMatch(
      /approval|license|permit|nrc/,
    )
  })
})

describe("research candidate scoring", () => {
  test("surfaces Figma Config as a conference lead from Figma Make context", () => {
    const snippets: SourceSnippet[] = [
      {
        url: "https://config.figma.com/",
        title: "Figma Config 2026 | June 23-25 - Moscone Center SF",
        publisher: "config.figma.com",
        quote:
          "Figma's annual conference includes keynotes, registration, product announcements, and sessions for builders. Figma Make was introduced as a prompt-to-app capability at Config.",
      },
    ]

    const candidates = buildResearchCandidates(snippets)

    expect(candidates[0]).toMatchObject({
      category: "conference",
      sourceUrls: ["https://config.figma.com/"],
    })
    expect(candidates[0]?.label).toContain("Figma Config")
  })

  test("surfaces agency approvals as regulatory leads", () => {
    const snippets: SourceSnippet[] = [
      {
        url: "https://www.nrc.gov/reactors/new-reactors.html",
        title: "NRC review timeline for advanced reactor license application",
        publisher: "nrc.gov",
        quote:
          "The company expects the NRC license approval decision after agency review, environmental assessment, and permit milestones.",
      },
    ]

    const candidates = buildResearchCandidates(snippets)

    expect(candidates[0]).toMatchObject({
      category: "regulatory",
      sourceUrls: ["https://www.nrc.gov/reactors/new-reactors.html"],
    })
  })
})
