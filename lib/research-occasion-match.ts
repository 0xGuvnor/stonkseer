import type { CatalystResearch } from "./research-contract"
import { normalizeSourceUrl } from "./research-source-url"

export const STRONG_MATCH_SCORE = 100
export const TITLE_JACCARD_STRONG_THRESHOLD = 0.3
export const COMBINED_JACCARD_STRONG_THRESHOLD = 0.32
export const AI_REVIEW_TITLE_JACCARD_MIN = 0.22
export const AI_REVIEW_TITLE_JACCARD_MAX = 0.44
export const AI_REVIEW_COMBINED_JACCARD_MIN = 0.28
export const AI_REVIEW_COMBINED_JACCARD_MAX = 0.38
export const DETERMINISTIC_MERGE_MIN_SCORE = TITLE_JACCARD_STRONG_THRESHOLD * 10

const PROCEEDING_ID_PATTERN =
  /\b(EA|PE|RC|INV|CIR|DE|FDA|BLA|NDA|CIK)?\s*([A-Z]{0,3})?\d{4,8}\b/gi

const COMPATIBLE_EVENT_TYPES = new Set<
  CatalystResearch["events"][number]["eventType"]
>(["product", "launch"])

const AGENCY_TOKENS = new Set([
  "nhtsa",
  "sec",
  "doj",
  "fda",
  "ftc",
  "cftc",
  "epa",
  "osha",
  "fcc",
  "eu",
  "ec",
])

export type CatalystEvent = CatalystResearch["events"][number]

export type OccasionPairScore = {
  score: number
  kind: "reject" | "strong" | "ambiguous" | "none"
}

export function normalizeTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  )
}

export function tokenJaccard(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) {
    return 0
  }

  let intersection = 0

  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1
    }
  }

  const union = setA.size + setB.size - intersection

  return union === 0 ? 0 : intersection / union
}

export function titleJaccard(a: string, b: string): number {
  return tokenJaccard(normalizeTokens(a), normalizeTokens(b))
}

export function eventText(event: CatalystEvent): string {
  return [
    event.title,
    event.summary,
    event.whyItMatters,
    ...event.sources.map((source) => `${source.title} ${source.quote}`),
  ].join(" ")
}

export function combinedTextJaccard(a: CatalystEvent, b: CatalystEvent): number {
  return tokenJaccard(
    normalizeTokens(`${a.title} ${a.summary}`),
    normalizeTokens(`${b.title} ${b.summary}`),
  )
}

export function extractProceedingIds(text: string): Set<string> {
  const ids = new Set<string>()

  for (const match of text.matchAll(/\b(EA|PE|RC|INV)\s*(\d{4,8})\b/gi)) {
    ids.add(`${match[1]!.toUpperCase()}${match[2]!}`)
  }

  for (const match of text.matchAll(PROCEEDING_ID_PATTERN)) {
    const prefix = match[1]?.toUpperCase()
    const digits = match[0]?.replace(/\s+/g, "")

    if (prefix && digits && /^(EA|PE|RC|INV)/i.test(prefix)) {
      ids.add(digits.toUpperCase())
    }
  }

  return ids
}

export function sharedProceedingId(a: CatalystEvent, b: CatalystEvent): boolean {
  const idsA = extractProceedingIds(eventText(a))
  const idsB = extractProceedingIds(eventText(b))

  for (const id of idsA) {
    if (idsB.has(id)) {
      return true
    }
  }

  return false
}

export function conflictingProceedingIds(
  a: CatalystEvent,
  b: CatalystEvent,
): boolean {
  const idsA = extractProceedingIds(eventText(a))
  const idsB = extractProceedingIds(eventText(b))

  if (idsA.size === 0 || idsB.size === 0) {
    return false
  }

  for (const id of idsA) {
    if (idsB.has(id)) {
      return false
    }
  }

  return true
}

export function hasConflictingTimingAnchors(
  a: CatalystEvent,
  b: CatalystEvent,
): boolean {
  if (
    a.periodKey !== undefined &&
    b.periodKey !== undefined &&
    a.periodKey !== b.periodKey
  ) {
    return true
  }

  if (
    a.expectedDate !== undefined &&
    b.expectedDate !== undefined &&
    a.expectedDate !== b.expectedDate
  ) {
    return true
  }

  if (
    a.windowStart !== undefined &&
    b.windowStart !== undefined &&
    a.windowStart !== b.windowStart
  ) {
    return true
  }

  if (
    a.windowEnd !== undefined &&
    b.windowEnd !== undefined &&
    a.windowEnd !== b.windowEnd
  ) {
    return true
  }

  return false
}

function eventSourceUrls(event: CatalystEvent): Set<string> {
  return new Set(event.sources.map((source) => normalizeSourceUrl(source.url)))
}

export function hasSharedSourceUrl(a: CatalystEvent, b: CatalystEvent): boolean {
  const urlsA = eventSourceUrls(a)

  for (const url of eventSourceUrls(b)) {
    if (urlsA.has(url)) {
      return true
    }
  }

  return false
}

export function sharedAgencyTokens(a: CatalystEvent, b: CatalystEvent): boolean {
  const tokensA = normalizeTokens(eventText(a))
  const tokensB = normalizeTokens(eventText(b))

  for (const agency of AGENCY_TOKENS) {
    if (tokensA.has(agency) && tokensB.has(agency)) {
      return true
    }
  }

  return false
}

export function hasCompatibleEventType(a: CatalystEvent, b: CatalystEvent): boolean {
  if (a.eventType === b.eventType) {
    return true
  }

  return (
    COMPATIBLE_EVENT_TYPES.has(a.eventType) &&
    COMPATIBLE_EVENT_TYPES.has(b.eventType)
  )
}

function hasPeriodKeyMatch(a: CatalystEvent, b: CatalystEvent): boolean {
  return (
    a.periodKey !== undefined &&
    a.periodKey === b.periodKey &&
    a.eventType === b.eventType
  )
}

function isAmbiguousTitleOverlap(titleOverlap: number): boolean {
  return (
    titleOverlap >= AI_REVIEW_TITLE_JACCARD_MIN &&
    titleOverlap <= AI_REVIEW_TITLE_JACCARD_MAX
  )
}

function isAmbiguousCombinedOverlap(combinedOverlap: number): boolean {
  return (
    combinedOverlap >= AI_REVIEW_COMBINED_JACCARD_MIN &&
    combinedOverlap <= AI_REVIEW_COMBINED_JACCARD_MAX
  )
}

export function scoreOccasionPair(
  a: CatalystEvent,
  b: CatalystEvent,
): OccasionPairScore {
  if (conflictingProceedingIds(a, b)) {
    return { score: 0, kind: "reject" }
  }

  const sharedId = sharedProceedingId(a, b)

  if (!sharedId && hasConflictingTimingAnchors(a, b)) {
    return { score: 0, kind: "reject" }
  }

  const titleOverlap = titleJaccard(a.title, b.title)
  const combinedOverlap = combinedTextJaccard(a, b)

  if (hasSharedSourceUrl(a, b)) {
    return {
      score: STRONG_MATCH_SCORE + titleOverlap,
      kind: "strong",
    }
  }

  if (sharedId) {
    return {
      score: STRONG_MATCH_SCORE + titleOverlap,
      kind: "strong",
    }
  }

  if (titleOverlap >= TITLE_JACCARD_STRONG_THRESHOLD) {
    return {
      score: titleOverlap * 10,
      kind: "strong",
    }
  }

  if (
    combinedOverlap >= COMBINED_JACCARD_STRONG_THRESHOLD &&
    hasCompatibleEventType(a, b)
  ) {
    return {
      score: 50 + combinedOverlap * 10,
      kind: "strong",
    }
  }

  if (
    hasPeriodKeyMatch(a, b) &&
    (combinedOverlap >= COMBINED_JACCARD_STRONG_THRESHOLD ||
      titleOverlap >= AI_REVIEW_TITLE_JACCARD_MIN)
  ) {
    return {
      score: STRONG_MATCH_SCORE + combinedOverlap * 10,
      kind: "strong",
    }
  }

  if (sharedAgencyTokens(a, b) && titleOverlap >= TITLE_JACCARD_STRONG_THRESHOLD) {
    return {
      score: 50 + titleOverlap * 10,
      kind: "strong",
    }
  }

  if (
    isAmbiguousTitleOverlap(titleOverlap) ||
    isAmbiguousCombinedOverlap(combinedOverlap)
  ) {
    return {
      score: Math.max(titleOverlap, combinedOverlap) * 10,
      kind: "ambiguous",
    }
  }

  return { score: 0, kind: "none" }
}

function preferTimingShape(
  a: CatalystEvent["timingShape"],
  b: CatalystEvent["timingShape"],
): CatalystEvent["timingShape"] {
  if (a === "open" || b === "open") {
    return "open"
  }

  if (a === "unknown" || b === "unknown") {
    return a === "unknown" ? b : a
  }

  return a
}

function titleSpecificity(title: string): number {
  return normalizeTokens(title).size
}

function preferTitle(a: string, b: string): string {
  const tokensA = titleSpecificity(a)
  const tokensB = titleSpecificity(b)

  if (tokensA !== tokensB) {
    return tokensA > tokensB ? a : b
  }

  return a.length >= b.length ? a : b
}

export function mergeOccasionEvents(
  primary: CatalystEvent,
  secondary: CatalystEvent,
): CatalystEvent {
  const sourceByUrl = new Map<string, CatalystEvent["sources"][number]>()

  for (const source of [...primary.sources, ...secondary.sources]) {
    sourceByUrl.set(normalizeSourceUrl(source.url), source)
  }

  const preferredSummary =
    primary.summary.length >= secondary.summary.length
      ? primary.summary
      : secondary.summary

  const preferredWhy =
    primary.whyItMatters.length >= secondary.whyItMatters.length
      ? primary.whyItMatters
      : secondary.whyItMatters

  const base = primary.confidence >= secondary.confidence ? primary : secondary

  return {
    ...base,
    title: preferTitle(primary.title, secondary.title),
    summary: preferredSummary,
    whyItMatters: preferredWhy,
    timingShape: preferTimingShape(primary.timingShape, secondary.timingShape),
    windowStart: primary.windowStart ?? secondary.windowStart,
    windowEnd: primary.windowEnd ?? secondary.windowEnd,
    periodKey: primary.periodKey ?? secondary.periodKey,
    expectedDate: primary.expectedDate ?? secondary.expectedDate,
    confidence: Math.max(primary.confidence, secondary.confidence),
    status:
      primary.status === "confirmed" || secondary.status === "confirmed"
        ? "confirmed"
        : primary.status === "likely" || secondary.status === "likely"
          ? "likely"
          : "speculative",
    expectedImpact:
      primary.expectedImpact === "high" || secondary.expectedImpact === "high"
        ? "high"
        : primary.expectedImpact === "medium" || secondary.expectedImpact === "medium"
          ? "medium"
          : "low",
    sources: [...sourceByUrl.values()],
  }
}
