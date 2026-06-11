import { describe, expect, test } from "bun:test"

import {
  buildFollowUpQueryPrompt,
  parseFollowUpQueries,
} from "./research-followup"

describe("parseFollowUpQueries", () => {
  test("parses plain one-query-per-line output", () => {
    const raw = [
      "Tesla Terafab Austin chip fab timeline 2026",
      "Tesla Optimus high volume production start date",
    ].join("\n")

    expect(parseFollowUpQueries(raw, 6)).toEqual([
      "Tesla Terafab Austin chip fab timeline 2026",
      "Tesla Optimus high volume production start date",
    ])
  })

  test("strips numbering, bullets, and surrounding quotes", () => {
    const raw = [
      "1. Tesla Roadster unveil date official announcement",
      "- Tesla EU FSD regulatory approval Netherlands RDW timeline",
      '* "Tesla Optimus Gen 3 reveal schedule"',
    ].join("\n")

    expect(parseFollowUpQueries(raw, 6)).toEqual([
      "Tesla Roadster unveil date official announcement",
      "Tesla EU FSD regulatory approval Netherlands RDW timeline",
      "Tesla Optimus Gen 3 reveal schedule",
    ])
  })

  test("drops headers, short lines, blank lines, and duplicates; caps at max", () => {
    const raw = [
      "Here are the queries:",
      "",
      "ok",
      "first follow-up query about a named program",
      "First follow-up query about a named program",
      "second follow-up query about a regulator",
      "third follow-up query about a factory site",
    ].join("\n")

    expect(parseFollowUpQueries(raw, 2)).toEqual([
      "first follow-up query about a named program",
      "second follow-up query about a regulator",
    ])
  })

  test("drops over-long lines that are prose, not queries", () => {
    const longLine = "word ".repeat(60)

    expect(parseFollowUpQueries(longLine, 6)).toEqual([])
  })
})

describe("buildFollowUpQueryPrompt", () => {
  test("includes the company label, cap, and report content", () => {
    const prompt = buildFollowUpQueryPrompt(
      "TSLA",
      "Tesla Inc",
      ["Report A mentions Terafab without timing."],
      6,
      Date.UTC(2026, 5, 11),
    )

    expect(prompt).toContain("Tesla Inc (TSLA)")
    expect(prompt).toContain("up to 6")
    expect(prompt).toContain("2026-06-11")
    expect(prompt).toContain("Report A mentions Terafab without timing.")
    expect(prompt).toContain("one query per line")
  })
})
