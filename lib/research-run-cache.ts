const ONE_DAY_MS = 24 * 60 * 60 * 1000

export const RESEARCH_CACHE_TTL_MS = 7 * ONE_DAY_MS

export const DEFAULT_CANONICAL_CACHE_RESOLVE_MAX_DEPTH = 8

export type ResearchRunCacheCandidate = {
  _id: string
  status: "queued" | "running" | "completed" | "failed"
  completedAt?: number
  createdAt?: number
  researchStrategyVersion?: string
  cacheHit: boolean
  cacheSourceRunId?: string
}

export function isResearchRunCacheFresh(
  run: Pick<
    ResearchRunCacheCandidate,
    "status" | "completedAt" | "researchStrategyVersion"
  >,
  now: number,
  strategyVersion: string,
  ttlMs: number = RESEARCH_CACHE_TTL_MS,
  cacheInvalidatedAt?: number,
): boolean {
  if (
    cacheInvalidatedAt !== undefined &&
    run.completedAt !== undefined &&
    run.completedAt <= cacheInvalidatedAt
  ) {
    return false
  }

  return (
    run.status === "completed" &&
    run.completedAt !== undefined &&
    run.completedAt > now - ttlMs &&
    run.researchStrategyVersion === strategyVersion
  )
}

export function resolveCanonicalCacheSourceRunId(
  startRunId: string,
  runsById: ReadonlyMap<string, ResearchRunCacheCandidate>,
  runIdsWithEvents: ReadonlySet<string>,
  maxDepth: number = DEFAULT_CANONICAL_CACHE_RESOLVE_MAX_DEPTH,
): string | null {
  let currentRunId: string | undefined = startRunId
  const visited = new Set<string>()

  for (let depth = 0; depth < maxDepth && currentRunId; depth += 1) {
    if (visited.has(currentRunId)) {
      return null
    }
    visited.add(currentRunId)

    if (runIdsWithEvents.has(currentRunId)) {
      return currentRunId
    }

    const run = runsById.get(currentRunId)
    if (!run) {
      return null
    }

    if (run.cacheHit && run.cacheSourceRunId) {
      currentRunId = run.cacheSourceRunId
      continue
    }

    return null
  }

  return null
}

export function selectUsableCacheSourceRunId(
  freshCandidates: readonly ResearchRunCacheCandidate[],
  runsById: ReadonlyMap<string, ResearchRunCacheCandidate>,
  runIdsWithEvents: ReadonlySet<string>,
  now: number,
  strategyVersion: string,
  ttlMs: number = RESEARCH_CACHE_TTL_MS,
  cacheInvalidatedAt?: number,
): string | null {
  for (const candidate of freshCandidates) {
    const canonicalRunId = resolveCanonicalCacheSourceRunId(
      candidate._id,
      runsById,
      runIdsWithEvents,
    )
    if (!canonicalRunId) {
      continue
    }

    const canonicalRun = runsById.get(canonicalRunId)
    if (!canonicalRun) {
      continue
    }

    if (
      !isResearchRunCacheFresh(
        canonicalRun,
        now,
        strategyVersion,
        ttlMs,
        cacheInvalidatedAt,
      ) ||
      !runIdsWithEvents.has(canonicalRunId)
    ) {
      continue
    }

    return canonicalRunId
  }

  return null
}

export function sortResearchRunsNewestFirst<
  T extends Pick<ResearchRunCacheCandidate, "completedAt" | "createdAt">,
>(runs: readonly T[]): T[] {
  return [...runs].sort((a, b) => {
    const aTimestamp = a.completedAt ?? a.createdAt ?? 0
    const bTimestamp = b.completedAt ?? b.createdAt ?? 0
    return bTimestamp - aTimestamp
  })
}

export function collectCacheResolutionRunIds(
  freshCandidates: readonly ResearchRunCacheCandidate[],
  runsById: ReadonlyMap<string, ResearchRunCacheCandidate>,
  maxDepth: number = DEFAULT_CANONICAL_CACHE_RESOLVE_MAX_DEPTH,
): string[] {
  const runIds = new Set<string>()

  for (const candidate of freshCandidates) {
    let currentRunId: string | undefined = candidate._id
    const visited = new Set<string>()

    for (let depth = 0; depth < maxDepth && currentRunId; depth += 1) {
      if (visited.has(currentRunId)) {
        break
      }
      visited.add(currentRunId)
      runIds.add(currentRunId)

      const run = runsById.get(currentRunId)
      if (run?.cacheHit && run.cacheSourceRunId) {
        currentRunId = run.cacheSourceRunId
        continue
      }

      break
    }
  }

  return [...runIds]
}
