import type { Id } from "../convex/_generated/dataModel"

type CompletedRunRef = {
  _id: Id<"researchRuns">
  completedAt?: number
}

/**
 * Picks the newest completed run from a set of source run ids (migration dedupe).
 */
export function selectNewestCompletedRunId(
  runs: Array<CompletedRunRef | null>,
): Id<"researchRuns"> | null {
  const newestRun = runs
    .filter((run): run is CompletedRunRef => run !== null && run.completedAt !== undefined)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0]

  return newestRun?._id ?? null
}

/**
 * Returns true when a stock should keep only one sourceRunId generation.
 */
export function shouldDedupeStockEvents(sourceRunIdCount: number): boolean {
  return sourceRunIdCount > 1
}
