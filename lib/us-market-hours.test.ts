import { describe, expect, test } from "bun:test"

import { isUsExtendedMarketSessionOpen } from "./us-market-hours"

describe("isUsExtendedMarketSessionOpen", () => {
  test("returns true during regular session on a weekday", () => {
    // Tue Jan 7 2025 10:00 AM ET (EST)
    expect(isUsExtendedMarketSessionOpen(new Date("2025-01-07T15:00:00Z"))).toBe(
      true,
    )
  })

  test("returns true during pre-market on a weekday", () => {
    // Tue Jan 7 2025 4:30 AM ET (EST)
    expect(isUsExtendedMarketSessionOpen(new Date("2025-01-07T09:30:00Z"))).toBe(
      true,
    )
  })

  test("returns true during after-hours on a weekday", () => {
    // Tue Jan 7 2025 7:00 PM ET (EST)
    expect(isUsExtendedMarketSessionOpen(new Date("2025-01-08T00:00:00Z"))).toBe(
      true,
    )
  })

  test("returns false after extended session on a weekday", () => {
    // Tue Jan 7 2025 9:00 PM ET (EST)
    expect(isUsExtendedMarketSessionOpen(new Date("2025-01-08T02:00:00Z"))).toBe(
      false,
    )
  })

  test("returns false before extended session on a weekday", () => {
    // Tue Jan 7 2025 2:00 AM ET (EST)
    expect(isUsExtendedMarketSessionOpen(new Date("2025-01-07T07:00:00Z"))).toBe(
      false,
    )
  })

  test("returns false on weekends", () => {
    // Sat Jan 11 2025 12:00 PM ET (EST)
    expect(isUsExtendedMarketSessionOpen(new Date("2025-01-11T17:00:00Z"))).toBe(
      false,
    )
  })

  test("handles daylight saving time in Eastern time", () => {
    // Tue Jun 17 2025 10:00 AM ET (EDT)
    expect(isUsExtendedMarketSessionOpen(new Date("2025-06-17T14:00:00Z"))).toBe(
      true,
    )
    // Tue Jun 17 2025 9:00 PM ET (EDT)
    expect(isUsExtendedMarketSessionOpen(new Date("2025-06-18T01:00:00Z"))).toBe(
      false,
    )
  })
})
