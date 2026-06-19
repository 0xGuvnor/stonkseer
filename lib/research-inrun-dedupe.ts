import { generateText, Output } from "ai"
import { z } from "zod"

import type { CatalystResearch } from "./research-contract"
import {
  buildGatewayProviderOptions,
  type ResearchGatewayContext,
} from "./research-gateway-observability"
import {
  type CatalystEvent,
  conflictingProceedingIds,
  DETERMINISTIC_MERGE_MIN_SCORE,
  hasConflictingTimingAnchors,
  mergeOccasionEvents,
  scoreOccasionPair,
  sharedProceedingId,
  STRONG_MATCH_SCORE,
} from "./research-occasion-match"

export { extractProceedingIds } from "./research-occasion-match"

const MAX_AI_PAIR_REVIEWS = 10

export type InRunDedupeStats = {
  mergedCount: number
  aiReviewCount: number
}

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

type PairCandidate = {
  indexA: number
  indexB: number
  score: number
}

function findDeterministicMergePairs(events: CatalystEvent[]): PairCandidate[] {
  const pairs: PairCandidate[] = []

  for (let indexA = 0; indexA < events.length; indexA += 1) {
    for (let indexB = indexA + 1; indexB < events.length; indexB += 1) {
      const { score, kind } = scoreOccasionPair(events[indexA]!, events[indexB]!)

      if (
        kind === "strong" &&
        (score >= DETERMINISTIC_MERGE_MIN_SCORE || score >= STRONG_MATCH_SCORE)
      ) {
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

      if (conflictingProceedingIds(eventA, eventB)) {
        continue
      }

      if (
        !sharedProceedingId(eventA, eventB) &&
        hasConflictingTimingAnchors(eventA, eventB)
      ) {
        continue
      }

      const { kind, score } = scoreOccasionPair(eventA, eventB)

      if (kind === "ambiguous") {
        pairs.push({ indexA, indexB, score })
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
  const merged = mergeOccasionEvents(events[indexA]!, events[indexB]!)
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
        "Merge when sources describe the same real-world occasion — same product or program plus same site or facility plus same milestone type (production start, facility opening, conference, earnings date, regulatory proceeding), even if titles or timingShape differ (e.g. open vs unknown, generic vs site-specific headline).",
        "Keep separate when official IDs conflict, calendar anchors clearly conflict, or the rows describe clearly distinct programs or sites.",
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
  events: CatalystResearch["events"][number][]
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
