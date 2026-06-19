import { describe, expect, test } from "bun:test"

import type { Id } from "@/convex/_generated/dataModel"
import type { CatalystEventView } from "@/types/research-ui"

import {
  CATALYST_EVENTS_CSV_HEADERS,
  catalystEventsToCsv,
  escapeCsvField,
} from "./catalyst-events-csv"

const fixtureNow = Date.parse("2025-06-13T12:00:00Z")

function catalystEvent(
  id: string,
  overrides: Partial<CatalystEventView> = {},
): CatalystEventView {
  return {
    _id: id as Id<"catalystEvents">,
    title: "Test catalyst",
    summary: "Summary text",
    whyItMatters: "Why it matters text",
    eventType: "product",
    timingShape: "point",
    datePrecision: "day",
    confidence: 0.7,
    expectedImpact: "medium",
    sources: [],
    ...overrides,
  }
}

describe("escapeCsvField", () => {
  test("leaves plain values unquoted", () => {
    expect(escapeCsvField("hello")).toBe("hello")
  })

  test("quotes values with commas", () => {
    expect(escapeCsvField("a,b")).toBe('"a,b"')
  })

  test("quotes values with quotes and escapes them", () => {
    expect(escapeCsvField('say "hello"')).toBe('"say ""hello"""')
  })

  test("quotes values with newlines", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"')
  })
})

describe("catalystEventsToCsv", () => {
  test("includes header row and one data row", () => {
    const csv = catalystEventsToCsv(
      [
        catalystEvent("evt_1", {
          title: "Product launch",
          expectedDate: "2026-05-01",
          expectedImpact: "high",
        }),
      ],
      fixtureNow,
    )

    const lines = csv.split("\n")
    expect(lines[0]).toBe(CATALYST_EVENTS_CSV_HEADERS.join(","))
    expect(lines[1]).toContain("Product launch")
    expect(lines[1]).toContain("High")
    expect(lines[1]).toContain("Summary text")
  })

  test("escapes fields containing commas", () => {
    const csv = catalystEventsToCsv(
      [
        catalystEvent("evt_1", {
          title: "Launch, phase two",
          expectedDate: "2026-05-01",
        }),
      ],
      fixtureNow,
    )

    expect(csv).toContain('"Launch, phase two"')
  })

  test("joins multiple sources with semicolons", () => {
    const csv = catalystEventsToCsv(
      [
        catalystEvent("evt_1", {
          expectedDate: "2026-05-01",
          sources: [
            {
              _id: "src_1" as Id<"eventSources">,
              url: "https://example.com/a",
              title: "A",
              publisher: "Reuters",
            },
            {
              _id: "src_2" as Id<"eventSources">,
              url: "https://example.com/b",
              title: "B",
              publisher: "https://example.com/b",
            },
          ],
        }),
      ],
      fixtureNow,
    )

    expect(csv).toContain(
      "Reuters (https://example.com/a); https://example.com/b",
    )
  })

  test("repeats quarter label only when quarter changes", () => {
    const csv = catalystEventsToCsv(
      [
        catalystEvent("evt_1", {
          title: "First",
          expectedDate: "2026-05-01",
        }),
        catalystEvent("evt_2", {
          title: "Second",
          expectedDate: "2026-06-01",
        }),
        catalystEvent("evt_3", {
          title: "Third",
          expectedDate: "2026-10-01",
        }),
      ],
      fixtureNow,
    )

    const rows = csv.split("\n").slice(1)
    expect(rows[0]?.startsWith("Q2 2026,")).toBe(true)
    expect(rows[1]?.startsWith(",")).toBe(true)
    expect(rows[2]?.startsWith("Q4 2026,")).toBe(true)
  })

  test("returns header only for empty event list", () => {
    expect(catalystEventsToCsv([], fixtureNow)).toBe(
      CATALYST_EVENTS_CSV_HEADERS.join(","),
    )
  })
})
