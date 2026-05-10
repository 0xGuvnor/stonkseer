import type { Id } from "@/convex/_generated/dataModel"

/** Payload persisted when navigating home → ticker route after starting a run. */
export type ActiveResearchSessionPayload = {
  runId: Id<"researchRuns">
  anonymousTokenHash?: string
}

export function activeResearchStorageKey(normalizedSymbol: string): string {
  return `stonkseer:activeResearch:${normalizedSymbol.toUpperCase()}`
}

export function writeActiveResearchSession(
  normalizedSymbol: string,
  payload: ActiveResearchSessionPayload
): void {
  if (typeof sessionStorage === "undefined") {
    return
  }
  sessionStorage.setItem(
    activeResearchStorageKey(normalizedSymbol),
    JSON.stringify({
      runId: payload.runId,
      ...(payload.anonymousTokenHash !== undefined
        ? { anonymousTokenHash: payload.anonymousTokenHash }
        : {}),
    })
  )
}

export function readActiveResearchSession(
  normalizedSymbol: string
): ActiveResearchSessionPayload | null {
  if (typeof sessionStorage === "undefined") {
    return null
  }
  const raw = sessionStorage.getItem(
    activeResearchStorageKey(normalizedSymbol)
  )
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || !("runId" in parsed)) {
      return null
    }
    const rec = parsed as {
      runId: string
      anonymousTokenHash?: string
    }
    if (typeof rec.runId !== "string") {
      return null
    }
    return {
      runId: rec.runId as Id<"researchRuns">,
      ...(typeof rec.anonymousTokenHash === "string"
        ? { anonymousTokenHash: rec.anonymousTokenHash }
        : {}),
    }
  } catch {
    return null
  }
}
