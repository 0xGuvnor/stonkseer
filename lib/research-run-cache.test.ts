import { describe, expect, test } from "bun:test"

import {
  isResearchRunCacheFresh,
  RESEARCH_CACHE_TTL_MS,
  resolveCanonicalCacheSourceRunId,
  selectUsableCacheSourceRunId,
  type ResearchRunCacheCandidate,
} from "./research-run-cache"
import { RESEARCH_STRATEGY_VERSION } from "./research-strategy"

const DAY_MS = 24 * 60 * 60 * 1000
const fixtureNow = Date.parse("2025-06-13T12:00:00Z")

function run(
  id: string,
  overrides: Partial<ResearchRunCacheCandidate> = {},
): ResearchRunCacheCandidate {
  return {
    _id: id,
    status: "completed",
    completedAt: fixtureNow - DAY_MS,
    createdAt: fixtureNow - DAY_MS,
    researchStrategyVersion: RESEARCH_STRATEGY_VERSION,
    cacheHit: false,
    ...overrides,
  }
}

function runsById(
  ...entries: ResearchRunCacheCandidate[]
): Map<string, ResearchRunCacheCandidate> {
  return new Map(entries.map((entry) => [entry._id, entry]))
}

describe("isResearchRunCacheFresh", () => {
  test("accepts completed runs within ttl and strategy version", () => {
    expect(
      isResearchRunCacheFresh(
        run("run1"),
        fixtureNow,
        RESEARCH_STRATEGY_VERSION,
        RESEARCH_CACHE_TTL_MS,
      ),
    ).toBe(true)
  })

  test("rejects runs outside ttl", () => {
    expect(
      isResearchRunCacheFresh(
        run("run1", { completedAt: fixtureNow - 8 * DAY_MS }),
        fixtureNow,
        RESEARCH_STRATEGY_VERSION,
        RESEARCH_CACHE_TTL_MS,
      ),
    ).toBe(false)
  })

  test("rejects strategy version mismatch", () => {
    expect(
      isResearchRunCacheFresh(
        run("run1", { researchStrategyVersion: "legacy-strategy" }),
        fixtureNow,
        RESEARCH_STRATEGY_VERSION,
        RESEARCH_CACHE_TTL_MS,
      ),
    ).toBe(false)
  })
})

describe("resolveCanonicalCacheSourceRunId", () => {
  test("returns the same id when the run owns events", () => {
    const canonical = run("run1")
    const map = runsById(canonical)
    const events = new Set(["run1"])

    expect(resolveCanonicalCacheSourceRunId("run1", map, events)).toBe("run1")
  })

  test("follows cache-hit shells to the canonical source run", () => {
    const canonical = run("run1")
    const shell = run("run2", {
      cacheHit: true,
      cacheSourceRunId: "run1",
      completedAt: fixtureNow - 12 * 60 * 60 * 1000,
    })
    const map = runsById(canonical, shell)
    const events = new Set(["run1"])

    expect(resolveCanonicalCacheSourceRunId("run2", map, events)).toBe("run1")
  })

  test("returns null for cache-hit shells without cacheSourceRunId", () => {
    const shell = run("run2", { cacheHit: true, cacheSourceRunId: undefined })
    const map = runsById(shell)

    expect(resolveCanonicalCacheSourceRunId("run2", map, new Set())).toBeNull()
  })

  test("returns null for pointer cycles", () => {
    const runA = run("runA", {
      cacheHit: true,
      cacheSourceRunId: "runB",
    })
    const runB = run("runB", {
      cacheHit: true,
      cacheSourceRunId: "runA",
    })
    const map = runsById(runA, runB)

    expect(resolveCanonicalCacheSourceRunId("runA", map, new Set())).toBeNull()
  })
})

describe("selectUsableCacheSourceRunId", () => {
  test("returns canonical run with events within ttl", () => {
    const canonical = run("run1")
    const map = runsById(canonical)
    const events = new Set(["run1"])

    expect(
      selectUsableCacheSourceRunId(
        [canonical],
        map,
        events,
        fixtureNow,
        RESEARCH_STRATEGY_VERSION,
        RESEARCH_CACHE_TTL_MS,
      ),
    ).toBe("run1")
  })

  test("resolves newest cache-hit shell to canonical source run", () => {
    const canonical = run("run1", { completedAt: fixtureNow - 2 * DAY_MS })
    const shell = run("run2", {
      cacheHit: true,
      cacheSourceRunId: "run1",
      completedAt: fixtureNow - 12 * 60 * 60 * 1000,
    })
    const map = runsById(canonical, shell)
    const events = new Set(["run1"])

    expect(
      selectUsableCacheSourceRunId(
        [shell, canonical],
        map,
        events,
        fixtureNow,
        RESEARCH_STRATEGY_VERSION,
        RESEARCH_CACHE_TTL_MS,
      ),
    ).toBe("run1")
  })

  test("returns null when shell is fresh but canonical source is stale", () => {
    const canonical = run("run1", { completedAt: fixtureNow - 8 * DAY_MS })
    const shell = run("run2", {
      cacheHit: true,
      cacheSourceRunId: "run1",
      completedAt: fixtureNow - 12 * 60 * 60 * 1000,
    })
    const map = runsById(canonical, shell)
    const events = new Set(["run1"])

    expect(
      selectUsableCacheSourceRunId(
        [shell],
        map,
        events,
        fixtureNow,
        RESEARCH_STRATEGY_VERSION,
        RESEARCH_CACHE_TTL_MS,
      ),
    ).toBeNull()
  })

  test("prefers the newest valid canonical run", () => {
    const older = run("run1", { completedAt: fixtureNow - 5 * DAY_MS })
    const newer = run("run2", { completedAt: fixtureNow - DAY_MS })
    const shell = run("run3", {
      cacheHit: true,
      cacheSourceRunId: "run2",
      completedAt: fixtureNow - 6 * 60 * 60 * 1000,
    })
    const map = runsById(older, newer, shell)
    const events = new Set(["run1", "run2"])

    expect(
      selectUsableCacheSourceRunId(
        [shell, newer, older],
        map,
        events,
        fixtureNow,
        RESEARCH_STRATEGY_VERSION,
        RESEARCH_CACHE_TTL_MS,
      ),
    ).toBe("run2")
  })

  test("skips completed runs with zero events that are not cache hits", () => {
    const empty = run("run1")
    const canonical = run("run2", { completedAt: fixtureNow - 2 * DAY_MS })
    const map = runsById(empty, canonical)
    const events = new Set(["run2"])

    expect(
      selectUsableCacheSourceRunId(
        [empty, canonical],
        map,
        events,
        fixtureNow,
        RESEARCH_STRATEGY_VERSION,
        RESEARCH_CACHE_TTL_MS,
      ),
    ).toBe("run2")
  })

  test("skips canonical runs with strategy version mismatch", () => {
    const canonical = run("run1", {
      researchStrategyVersion: "legacy-strategy",
    })
    const map = runsById(canonical)
    const events = new Set(["run1"])

    expect(
      selectUsableCacheSourceRunId(
        [canonical],
        map,
        events,
        fixtureNow,
        RESEARCH_STRATEGY_VERSION,
        RESEARCH_CACHE_TTL_MS,
      ),
    ).toBeNull()
  })
})
