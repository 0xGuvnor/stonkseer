import { describe, expect, test } from "bun:test"

import {
  diversifySnippetsByDomain,
  excerptOnlyQuote,
  type SourceSnippet,
} from "./research-discovery"

describe("excerptOnlyQuote", () => {
  test("returns null when excerpts are empty", () => {
    expect(excerptOnlyQuote(undefined)).toBeNull()
    expect(excerptOnlyQuote([])).toBeNull()
  })

  test("merges non-empty excerpts", () => {
    expect(excerptOnlyQuote(["  First sentence. ", "Second sentence."])).toBe(
      "First sentence. Second sentence.",
    )
  })

  test("clips merged excerpts to the max length", () => {
    const result = excerptOnlyQuote(["a".repeat(40)], 20)

    expect(result).not.toBeNull()
    expect(result!.length).toBeLessThanOrEqual(20)
    expect(result!.endsWith("…")).toBe(true)
  })
})

describe("diversifySnippetsByDomain", () => {
  const snippet = (url: string): SourceSnippet => ({
    url,
    title: url,
    publisher: new URL(url).hostname,
    quote: `Quote from ${url}`,
    provenance: "tool_excerpt",
  })

  test("returns snippets unchanged when under the cap", () => {
    const snippets = [
      snippet("https://a.com/1"),
      snippet("https://b.com/1"),
    ]

    expect(diversifySnippetsByDomain(snippets, 5)).toEqual(snippets)
  })

  test("prefers breadth of publishers when over the cap", () => {
    const snippets = [
      snippet("https://a.com/1"),
      snippet("https://a.com/2"),
      snippet("https://a.com/3"),
      snippet("https://b.com/1"),
      snippet("https://c.com/1"),
    ]

    const result = diversifySnippetsByDomain(snippets, 3)
    const hosts = result.map((row) => new URL(row.url).hostname)

    expect(result).toHaveLength(3)
    expect(new Set(hosts)).toEqual(new Set(["a.com", "b.com", "c.com"]))
  })
})
