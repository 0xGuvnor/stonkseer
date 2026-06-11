import { describe, expect, test } from "bun:test"

import { rankUrlsForDeepRead } from "./research-exa"
import type { SourceSnippet } from "./research-discovery"

describe("rankUrlsForDeepRead", () => {
  test("prefers diverse quotes over redundant regulatory coverage", () => {
    const snippets: SourceSnippet[] = [
      {
        url: "https://example.com/fsd-eu-1",
        title: "FSD EU 1",
        publisher: "example.com",
        quote:
          "Tesla FSD supervised EU approval mutual recognition TCMV Netherlands RDW regulatory timeline summer 2026.",
        provenance: "tool_excerpt",
      },
      {
        url: "https://example.com/fsd-eu-2",
        title: "FSD EU 2",
        publisher: "example.com",
        quote:
          "Tesla FSD supervised EU approval mutual recognition TCMV Netherlands RDW regulatory timeline Q3 2026.",
        provenance: "tool_excerpt",
      },
      {
        url: "https://example.com/optimus",
        title: "Optimus Gen 3",
        publisher: "example.com",
        quote:
          "Tesla Optimus Gen 3 production Fremont line conversion reveal late summer 2026 humanoid robot manufacturing ramp.",
        provenance: "tool_excerpt",
      },
      {
        url: "https://example.com/terafab",
        title: "Terafab",
        publisher: "example.com",
        quote:
          "Tesla Terafab Austin chip fabrication AI5 small batch production late 2026 manufacturing joint venture.",
        provenance: "tool_excerpt",
      },
    ]

    const ranked = rankUrlsForDeepRead(snippets, new Map(), 3)

    expect(ranked).toHaveLength(3)
    expect(ranked.some((url) => url.includes("optimus"))).toBe(true)
    expect(ranked.some((url) => url.includes("terafab"))).toBe(true)
  })
})
