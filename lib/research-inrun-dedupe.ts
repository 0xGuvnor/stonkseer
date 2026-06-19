import { generateText, Output } from "ai"
import { z } from "zod"

import type { CatalystResearch } from "./research-contract"
import {
  buildGatewayProviderOptions,
  type ResearchGatewayContext,
} from "./research-gateway-observability"
import { normalizeSourceUrl } from "./research-source-url"

const STRONG_MATCH_SCORE = 100
const TITLE_JACCARD_INRUN_THRESHOLD = 0.3
const AI_REVIEW_JACCARD_MIN = 0.25
const AI_REVIEW_JACCARD_MAX = 0.44
const MAX_AI_PAIR_REVIEWS = 10

const PROCEEDING_ID_PATTERN =
  /\b(EA|PE|RC|INV|CIR|DE|FDA|BLA|NDA|CIK)?\s*([A-Z]{0,3})?\d{4,8}\b/gi

const REGULATORY_EVENT_TYPES = new Set<CatalystResearch["events"][number]["eventType"]>([
  "regulatory",
  "legal",
])

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

export type InRunDedupeStats = {
  mergedCount: number
  aiReviewCount: number
}

type CatalystEvent = CatalystResearch["events"][number]

const inRunDedupeDecisionSchema = z.object({
  pairs: z.array(
    z.object({
      indexA: z.number().int().nonnegative(),
      indexB: z.number().int().nonnegative(),
      action: z.enum(["merge", "keep_separate"]),
      reason: z.string().min(1),
    }),
  ),
})

export function isInRunDedupeEnabled(): boolean {
  const raw = process.env.CATALYST_INRUN_DEDUPE_ENABLED?.trim()

  if (!raw) {
    return true
  }

  return raw !== "0" && raw.toLowerCase() !== "false"
}

function normalizeTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  )
}

function titleJaccard(a: string, b: string): number {
  const setA = normalizeTokens(a)
  const setB = normalizeTokens(b)

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

function eventText(event: CatalystEvent): string {
  return [
    event.title,
    event.summary,
    event.whyItMatters,
    ...event.sources.map((source) => `${source.title} ${source.quote}`),
  ].join(" ")
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

function sharedProceedingId(a: CatalystEvent, b: CatalystEvent): boolean {
  const idsA = extractProceedingIds(eventText(a))
  const idsB = extractProceedingIds(eventText(b))

  for (const id of idsA) {
    if (idsB.has(id)) {
      return true
    }
  }

  return false
}

function conflictingProceedingIds(a: CatalystEvent, b: CatalystEvent): boolean {
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

function hasConflictingTimingAnchors(a: CatalystEvent, b: CatalystEvent): boolean {
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

function hasSharedSourceUrl(a: CatalystEvent, b: CatalystEvent): boolean {
  const urlsA = eventSourceUrls(a)

  for (const url of eventSourceUrls(b)) {
    if (urlsA.has(url)) {
      return true
    }
  }

  return false
}

function sharedAgencyTokens(a: CatalystEvent, b: CatalystEvent): boolean {
  const tokensA = normalizeTokens(eventText(a))
  const tokensB = normalizeTokens(eventText(b))

  for (const agency of AGENCY_TOKENS) {
    if (tokensA.has(agency) && tokensB.has(agency)) {
      return true
    }
  }

  return false
}

function isRegulatoryPair(a: CatalystEvent, b: CatalystEvent): boolean {
  return (
    REGULATORY_EVENT_TYPES.has(a.eventType) &&
    REGULATORY_EVENT_TYPES.has(b.eventType)
  )
}

function scoreEventPair(a: CatalystEvent, b: CatalystEvent): number {
  if (conflictingProceedingIds(a, b)) {
    return 0
  }

  const sharedId = sharedProceedingId(a, b)

  if (!sharedId && hasConflictingTimingAnchors(a, b)) {
    return 0
  }

  if (hasSharedSourceUrl(a, b)) {
    return STRONG_MATCH_SCORE + titleJaccard(a.title, b.title)
  }

  if (sharedProceedingId(a, b)) {
    return STRONG_MATCH_SCORE + titleJaccard(a.title, b.title)
  }

  if (isRegulatoryPair(a, b) && sharedAgencyTokens(a, b)) {
    const jaccard = titleJaccard(a.title, b.title)

    if (jaccard >= TITLE_JACCARD_INRUN_THRESHOLD) {
      return 50 + jaccard * 10
    }
  }

  const jaccard = titleJaccard(a.title, b.title)

  if (jaccard >= TITLE_JACCARD_INRUN_THRESHOLD) {
    return jaccard * 10
  }

  return 0
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

function mergeTwoEvents(primary: CatalystEvent, secondary: CatalystEvent): CatalystEvent {
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

  return {
    ...primary,
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

type PairCandidate = {
  indexA: number
  indexB: number
  score: number
}

function findDeterministicMergePairs(events: CatalystEvent[]): PairCandidate[] {
  const pairs: PairCandidate[] = []

  for (let indexA = 0; indexA < events.length; indexA += 1) {
    for (let indexB = indexA + 1; indexB < events.length; indexB += 1) {
      const score = scoreEventPair(events[indexA]!, events[indexB]!)

      if (score >= TITLE_JACCARD_INRUN_THRESHOLD * 10 || score >= STRONG_MATCH_SCORE) {
        pairs.push({ indexA, indexB, score })
      }
    }
  }

  return pairs.sort((a, b) => b.score - a.score)
}

function findAmbiguousPairs(events: CatalystEvent[]): PairCandidate[] {
  const pairs: PairCandidate[] = []

  for (let indexA = 0; indexA < events.length; indexA += 1) {
    for (let indexB = indexA + 1; indexB < events.length; indexB += 1) {
      const eventA = events[indexA]!
      const eventB = events[indexB]!

      if (!isRegulatoryPair(eventA, eventB)) {
        continue
      }

      if (conflictingProceedingIds(eventA, eventB)) {
        continue
      }

      if (
        !sharedProceedingId(eventA, eventB) &&
        hasConflictingTimingAnchors(eventA, eventB)
      ) {
        continue
      }

      const jaccard = titleJaccard(eventA.title, eventB.title)

      if (jaccard >= AI_REVIEW_JACCARD_MIN && jaccard <= AI_REVIEW_JACCARD_MAX) {
        if (sharedAgencyTokens(eventA, eventB) || sharedProceedingId(eventA, eventB)) {
          pairs.push({ indexA, indexB, score: jaccard })
        }
      }
    }
  }

  return pairs
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_AI_PAIR_REVIEWS)
}

function applyMergePair(
  events: CatalystEvent[],
  indexA: number,
  indexB: number,
): CatalystEvent[] {
  const merged = mergeTwoEvents(events[indexA]!, events[indexB]!)
  const next = events.filter((_, index) => index !== indexA && index !== indexB)

  const insertAt = Math.min(indexA, indexB)
  next.splice(insertAt, 0, merged)

  return next
}

async function reviewAmbiguousPairs(args: {
  events: CatalystEvent[]
  pairs: PairCandidate[]
  symbol: string
  gatewayCtx: ResearchGatewayContext
}): Promise<Set<string>> {
  const mergeKeys = new Set<string>()

  if (args.pairs.length === 0 || !isInRunDedupeEnabled()) {
    return mergeKeys
  }

  const model = process.env.AI_GATEWAY_MODEL?.trim()

  if (!model) {
    return mergeKeys
  }

  const pairPayload = args.pairs.map((pair) => ({
    indexA: pair.indexA,
    indexB: pair.indexB,
    eventA: args.events[pair.indexA],
    eventB: args.events[pair.indexB],
  }))

  try {
    const { output } = await generateText({
      model,
      system:
        "Return JSON only. Decide merge or keep_separate for each candidate pair of catalyst events from the same extraction run.",
      providerOptions: buildGatewayProviderOptions(args.gatewayCtx, "inrun-dedupe"),
      output: Output.object({
        schema: inRunDedupeDecisionSchema,
      }),
      prompt: [
        `Review candidate duplicate catalyst events for ${args.symbol} from the same research run.`,
        "Merge when sources describe the same open regulatory proceeding, investigation, or litigation — even if titles or timingShape differ (open vs unknown).",
        "Keep separate when official IDs conflict or facts clearly describe different proceedings.",
        JSON.stringify(pairPayload, null, 2),
      ].join("\n\n"),
    })

    for (const decision of output.pairs) {
      if (
        decision.action === "merge" &&
        decision.indexA >= 0 &&
        decision.indexB >= 0 &&
        decision.indexA < args.events.length &&
        decision.indexB < args.events.length
      ) {
        const key = `${Math.min(decision.indexA, decision.indexB)}:${Math.max(decision.indexA, decision.indexB)}`
        mergeKeys.add(key)
      }
    }
  } catch (error) {
    console.warn(
      `[stonkseer-research] In-run dedupe AI review failed for ${args.symbol}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  return mergeKeys
}

export function dedupeIntraRunCatalystEventsDeterministic(
  events: CatalystEvent[],
): { events: CatalystEvent[]; mergedCount: number } {
  if (events.length < 2) {
    return { events, mergedCount: 0 }
  }

  let current = [...events]
  let mergedCount = 0
  let pairs = findDeterministicMergePairs(current)

  while (pairs.length > 0) {
    const best = pairs[0]!

    current = applyMergePair(current, best.indexA, best.indexB)
    mergedCount += 1
    pairs = findDeterministicMergePairs(current)
  }

  return { events: current, mergedCount }
}

export async function dedupeIntraRunCatalystEvents(args: {
  events: CatalystEvent[]
  gatewayCtx: ResearchGatewayContext
  symbol: string
}): Promise<{ events: CatalystEvent[]; stats: InRunDedupeStats }> {
  if (args.events.length < 2) {
    return {
      events: args.events,
      stats: { mergedCount: 0, aiReviewCount: 0 },
    }
  }

  const deterministic = dedupeIntraRunCatalystEventsDeterministic(args.events)
  let current = deterministic.events
  let mergedCount = deterministic.mergedCount

  const ambiguousPairs = findAmbiguousPairs(current)
  const aiReviewCount = ambiguousPairs.length

  if (ambiguousPairs.length === 0) {
    return {
      events: current,
      stats: { mergedCount, aiReviewCount: 0 },
    }
  }

  const mergeKeys = await reviewAmbiguousPairs({
    events: current,
    pairs: ambiguousPairs,
    symbol: args.symbol,
    gatewayCtx: args.gatewayCtx,
  })

  for (const key of [...mergeKeys].sort((a, b) => {
    const [aA, aB] = a.split(":").map(Number)
    const [bA, bB] = b.split(":").map(Number)
    return bA! - aA! || bB! - aB!
  })) {
    const [indexA, indexB] = key.split(":").map(Number)

    if (
      indexA === undefined ||
      indexB === undefined ||
      indexA < 0 ||
      indexB < 0 ||
      indexA >= current.length ||
      indexB >= current.length
    ) {
      continue
    }

    current = applyMergePair(current, indexA, indexB)
    mergedCount += 1
  }

  return {
    events: current,
    stats: { mergedCount, aiReviewCount },
  }
}
