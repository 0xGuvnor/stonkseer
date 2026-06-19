import { generateText, Output } from "ai"
import { z } from "zod"

import {
  parseIsoPrefixToLocalDate,
  parsePeriodKey,
  startOfLocalDay,
  type CatalystTimingFields,
} from "./catalyst-timing"
import type { CatalystResearch } from "./research-contract"
import { MAX_CATALYST_EVENTS } from "./research-contract"
import {
  buildGatewayProviderOptions,
  type ResearchGatewayContext,
} from "./research-gateway-observability"
import {
  DETERMINISTIC_MERGE_MIN_SCORE,
  mergeOccasionEvents,
  scoreOccasionPair,
} from "./research-occasion-match"

const DEFAULT_CARRY_FORWARD_MAX_AGE_DAYS = 30
const DEFAULT_MAX_CARRIED_EVENTS = 8
const MAX_PRIOR_THEME_COUNT = 4
const MAX_PRIOR_THEME_FOLLOWUP_QUERIES = 2

export type PriorCatalystEvent = CatalystResearch["events"][number] & {
  createdAt: number
  lastVerifiedAt: number
}

export type ReconciledCatalystEvent = CatalystResearch["events"][number] & {
  createdAt?: number
  lastVerifiedAt?: number
  carriedForward?: boolean
}

export type ReconcileStats = {
  priorEventCount: number
  matchedCount: number
  carriedForwardCount: number
  reconcileDroppedCount: number
  reconcileAiReviewCount: number
}

type MatchResult = {
  mergedNewEvents: ReconciledCatalystEvent[]
  unmatchedPrior: PriorCatalystEvent[]
}

const reconcileDecisionSchema = z.object({
  decisions: z.array(
    z.object({
      priorIndex: z.number().int().nonnegative(),
      action: z.enum(["keep", "drop"]),
      reason: z.string().min(1),
    }),
  ),
})

export function isReconcileEnabled(): boolean {
  const raw = process.env.CATALYST_RECONCILE_ENABLED?.trim()

  if (!raw) {
    return true
  }

  return raw !== "0" && raw.toLowerCase() !== "false"
}

export function getCarryForwardMaxAgeMs(): number {
  const value = Number(process.env.CATALYST_CARRY_FORWARD_MAX_AGE_DAYS)

  const days =
    Number.isInteger(value) && value > 0
      ? value
      : DEFAULT_CARRY_FORWARD_MAX_AGE_DAYS

  return days * 24 * 60 * 60 * 1000
}

export function getMaxCarriedEvents(): number {
  const value = Number(process.env.CATALYST_MAX_CARRIED_EVENTS)

  return Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_MAX_CARRIED_EVENTS
}

function mergeMatchedEvents(
  prior: PriorCatalystEvent,
  newer: CatalystResearch["events"][number],
  now: number,
): ReconciledCatalystEvent {
  const merged = mergeOccasionEvents(prior, newer)

  return {
    ...merged,
    createdAt: prior.createdAt,
    lastVerifiedAt: now,
    carriedForward: false,
  }
}

export function matchPriorAndNewEvents(
  priorEvents: PriorCatalystEvent[],
  newEvents: CatalystResearch["events"],
  now: number,
): MatchResult {
  const mergedNewEvents: ReconciledCatalystEvent[] = newEvents.map((event) => ({
    ...event,
    lastVerifiedAt: now,
  }))
  const usedNewIndexes = new Set<number>()
  const unmatchedPrior: PriorCatalystEvent[] = []

  for (const prior of priorEvents) {
    let bestIndex = -1
    let bestScore = 0

    for (let index = 0; index < newEvents.length; index += 1) {
      if (usedNewIndexes.has(index)) {
        continue
      }

      const { score, kind } = scoreOccasionPair(prior, newEvents[index]!)

      if (kind === "strong" && score > bestScore) {
        bestScore = score
        bestIndex = index
      }
    }

    if (
      bestIndex >= 0 &&
      bestScore >= DETERMINISTIC_MERGE_MIN_SCORE
    ) {
      usedNewIndexes.add(bestIndex)
      mergedNewEvents[bestIndex] = mergeMatchedEvents(
        prior,
        newEvents[bestIndex]!,
        now,
      )
      continue
    }

    unmatchedPrior.push(prior)
  }

  return { mergedNewEvents, unmatchedPrior }
}

function isTimingExpired(
  event: CatalystTimingFields,
  now: number,
): boolean {
  const runDay = startOfLocalDay(now)

  switch (event.timingShape) {
    case "point": {
      const date = parseIsoPrefixToLocalDate(event.expectedDate)
      return date !== null && date.getTime() < runDay.getTime()
    }
    case "closed_window":
    case "by": {
      const end = parseIsoPrefixToLocalDate(event.windowEnd)
      return end !== null && end.getTime() < runDay.getTime()
    }
    case "period": {
      if (!event.periodKey) {
        return false
      }

      const parsed = parsePeriodKey(event.periodKey)

      if (!parsed) {
        return false
      }

      return parsed.anchorEnd.getTime() < runDay.getTime()
    }
    default:
      return false
  }
}

function hasSocialSource(
  event: CatalystResearch["events"][number],
): boolean {
  return event.sources.some((source) => {
    try {
      const hostname = new URL(source.url).hostname.replace(/^www\./, "")
      return hostname === "x.com" || hostname === "twitter.com"
    } catch {
      return false
    }
  })
}

function markCarriedForwardSources(
  event: CatalystResearch["events"][number],
): CatalystResearch["events"][number] {
  return {
    ...event,
    sources: event.sources.map((source) => ({
      ...source,
      provenance: "prior_run_carryforward" as const,
    })),
  }
}

type PolicySplit = {
  autoDrop: PriorCatalystEvent[]
  autoKeep: PriorCatalystEvent[]
  aiReview: PriorCatalystEvent[]
}

export function applyCarryForwardPolicy(
  unmatchedPrior: PriorCatalystEvent[],
  now: number,
): PolicySplit {
  const maxAgeMs = getCarryForwardMaxAgeMs()
  const autoDrop: PriorCatalystEvent[] = []
  const autoKeep: PriorCatalystEvent[] = []
  const aiReview: PriorCatalystEvent[] = []

  for (const prior of unmatchedPrior) {
    if (isTimingExpired(prior, now)) {
      autoDrop.push(prior)
      continue
    }

    if (now - prior.lastVerifiedAt > maxAgeMs) {
      autoDrop.push(prior)
      continue
    }

    if (prior.status === "confirmed") {
      autoDrop.push(prior)
      continue
    }

    if (
      (prior.status === "speculative" || prior.status === "likely") &&
      hasSocialSource(prior)
    ) {
      autoKeep.push(prior)
      continue
    }

    aiReview.push(prior)
  }

  return { autoDrop, autoKeep, aiReview }
}

function toCarriedEvent(prior: PriorCatalystEvent): ReconciledCatalystEvent {
  return {
    ...markCarriedForwardSources(prior),
    createdAt: prior.createdAt,
    lastVerifiedAt: prior.lastVerifiedAt,
    carriedForward: true,
  }
}

function trimToEventCaps(
  mergedNewEvents: ReconciledCatalystEvent[],
  carriedEvents: ReconciledCatalystEvent[],
): {
  events: ReconciledCatalystEvent[]
  droppedCount: number
} {
  let events = [...mergedNewEvents, ...carriedEvents]
  let droppedCount = 0

  const maxCarried = getMaxCarriedEvents()

  while (
    events.filter((event) => event.carriedForward).length > maxCarried
  ) {
    const carriedIndexes = events
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.carriedForward)
      .sort((a, b) => {
        if (a.event.status !== b.event.status) {
          return a.event.status === "speculative" ? -1 : 1
        }

        if (a.event.confidence !== b.event.confidence) {
          return a.event.confidence - b.event.confidence
        }

        return (
          (a.event.lastVerifiedAt ?? 0) - (b.event.lastVerifiedAt ?? 0)
        )
      })

    const dropTarget = carriedIndexes[0]

    if (!dropTarget) {
      break
    }

    events = events.filter((_, index) => index !== dropTarget.index)
    droppedCount += 1
  }

  while (events.length > MAX_CATALYST_EVENTS) {
    const dropTarget = events
      .map((event, index) => ({ event, index }))
      .sort((a, b) => {
        if (Boolean(a.event.carriedForward) !== Boolean(b.event.carriedForward)) {
          return a.event.carriedForward ? -1 : 1
        }

        if (a.event.status !== b.event.status) {
          return a.event.status === "speculative" ? -1 : 1
        }

        if (a.event.confidence !== b.event.confidence) {
          return a.event.confidence - b.event.confidence
        }

        return (
          (a.event.lastVerifiedAt ?? Number.MAX_SAFE_INTEGER) -
          (b.event.lastVerifiedAt ?? Number.MAX_SAFE_INTEGER)
        )
      })[0]

    if (!dropTarget) {
      break
    }

    events = events.filter((_, index) => index !== dropTarget.index)
    droppedCount += 1
  }

  return { events, droppedCount }
}

export function selectPriorThemesForFollowUp(
  priorEvents: PriorCatalystEvent[],
  maxThemes: number = MAX_PRIOR_THEME_COUNT,
): string[] {
  const ranked = [...priorEvents].sort((a, b) => {
    const statusRank = (status: PriorCatalystEvent["status"]) => {
      switch (status) {
        case "speculative":
          return 0
        case "likely":
          return 1
        case "confirmed":
          return 2
        default: {
          const _exhaustive: never = status
          return _exhaustive
        }
      }
    }

    const statusDiff = statusRank(a.status) - statusRank(b.status)

    if (statusDiff !== 0) {
      return statusDiff
    }

    return b.lastVerifiedAt - a.lastVerifiedAt
  })

  const themes: string[] = []

  for (const event of ranked) {
    const theme = `${event.title}: ${event.summary}`.trim()

    if (theme.length === 0) {
      continue
    }

    themes.push(theme.slice(0, 220))

    if (themes.length >= maxThemes) {
      break
    }
  }

  return themes
}

export function buildPriorThemeFollowUpQueries(
  symbol: string,
  companyName: string | undefined,
  priorThemes: string[],
  maxQueries: number = MAX_PRIOR_THEME_FOLLOWUP_QUERIES,
): string[] {
  if (priorThemes.length === 0 || maxQueries <= 0) {
    return []
  }

  const label = companyName ? `${companyName} (${symbol})` : symbol
  const queries: string[] = []
  const seen = new Set<string>()

  for (const theme of priorThemes) {
    const query = `${label} ${theme}`.slice(0, 200)
    const key = query.toLowerCase()

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    queries.push(query)

    if (queries.length >= maxQueries) {
      break
    }
  }

  return queries
}

export function getPriorThemeFollowUpQueryBudget(): number {
  const maxQueries = Number(process.env.CATALYST_FOLLOWUP_MAX_QUERIES)

  if (!Number.isInteger(maxQueries) || maxQueries <= 0) {
    return 0
  }

  return Math.min(MAX_PRIOR_THEME_FOLLOWUP_QUERIES, maxQueries)
}

async function reviewCarryForwardCandidates(args: {
  symbol: string
  companyName?: string
  candidates: PriorCatalystEvent[]
  newEvents: CatalystResearch["events"]
  providerReports: Array<{ provider: string; report: string }>
  now: number
  gatewayCtx: ResearchGatewayContext
}): Promise<{
  kept: PriorCatalystEvent[]
  droppedCount: number
}> {
  if (args.candidates.length === 0) {
    return { kept: [], droppedCount: 0 }
  }

  const model = process.env.AI_GATEWAY_MODEL?.trim()

  if (!model) {
    return { kept: [], droppedCount: args.candidates.length }
  }

  const today = new Date(args.now).toISOString().slice(0, 10)
  const companyLabel = args.companyName
    ? `${args.companyName} (${args.symbol})`
    : args.symbol

  const reportsBlock =
    args.providerReports.length > 0
      ? args.providerReports
          .map(
            (entry) => `### ${entry.provider}\n${entry.report.slice(0, 4000)}`,
          )
          .join("\n\n")
      : "No provider reports available."

  const prompt = [
    `Today is ${today}. Review prior catalyst events for ${companyLabel} that were not re-found in the latest research run.`,
    "For each prior event, decide keep or drop.",
    "Rules:",
    "- Silence in the new run is NOT disproof.",
    "- Drop only when new reports clearly contradict the prior event, timing is clearly past, or the theme looks resolved/debunked.",
    "- Do not merge conflicting dates, share counts, or percentages across events.",
    "- Prefer keep for recent niche or social-sourced themes still within the carry-forward window.",
    "New run events:",
    JSON.stringify(args.newEvents, null, 2),
    "Prior-only candidates:",
    JSON.stringify(args.candidates, null, 2),
    "Latest provider reports:",
    reportsBlock,
  ].join("\n\n")

  try {
    const { output } = await generateText({
      model,
      system:
        "Return JSON only. Decide keep or drop for each prior-only catalyst candidate.",
      providerOptions: buildGatewayProviderOptions(
        args.gatewayCtx,
        "reconcile-carryforward",
      ),
      output: Output.object({
        schema: reconcileDecisionSchema,
      }),
      prompt,
    })

    const keepIndexes = new Set<number>()

    for (const decision of output.decisions) {
      if (
        decision.action === "keep" &&
        decision.priorIndex >= 0 &&
        decision.priorIndex < args.candidates.length
      ) {
        keepIndexes.add(decision.priorIndex)
      }
    }

    const kept = args.candidates.filter((_, index) => keepIndexes.has(index))

    return {
      kept,
      droppedCount: args.candidates.length - kept.length,
    }
  } catch (error) {
    console.warn(
      `[stonkseer-research] Carry-forward AI review failed for ${args.symbol}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )

    return { kept: [], droppedCount: args.candidates.length }
  }
}

export function stripReconcileMetadata(
  events: ReconciledCatalystEvent[],
): Array<Omit<ReconciledCatalystEvent, "carriedForward">> {
  return events.map((event) => {
    const { carriedForward, ...rest } = event
    void carriedForward
    return rest
  })
}

export async function reconcileCatalystEventsWithPrior(args: {
  priorEvents: PriorCatalystEvent[]
  newEvents: CatalystResearch["events"]
  now: number
  gatewayCtx: ResearchGatewayContext
  providerReports?: Array<{ provider: string; report: string }>
  companyName?: string
  symbol: string
}): Promise<{
  events: ReconciledCatalystEvent[]
  stats: ReconcileStats
}> {
  const priorEventCount = args.priorEvents.length

  if (priorEventCount === 0) {
    return {
      events: args.newEvents.map((event) => ({
        ...event,
        lastVerifiedAt: args.now,
      })),
      stats: {
        priorEventCount: 0,
        matchedCount: 0,
        carriedForwardCount: 0,
        reconcileDroppedCount: 0,
        reconcileAiReviewCount: 0,
      },
    }
  }

  const { mergedNewEvents, unmatchedPrior } = matchPriorAndNewEvents(
    args.priorEvents,
    args.newEvents,
    args.now,
  )

  const matchedCount = args.priorEvents.length - unmatchedPrior.length
  const { autoDrop, autoKeep, aiReview } = applyCarryForwardPolicy(
    unmatchedPrior,
    args.now,
  )

  let aiKept: PriorCatalystEvent[] = []
  let aiDroppedCount = 0

  if (isReconcileEnabled() && aiReview.length > 0) {
    const review = await reviewCarryForwardCandidates({
      symbol: args.symbol,
      companyName: args.companyName,
      candidates: aiReview,
      newEvents: args.newEvents,
      providerReports: args.providerReports ?? [],
      now: args.now,
      gatewayCtx: args.gatewayCtx,
    })

    aiKept = review.kept
    aiDroppedCount = review.droppedCount
  } else {
    aiDroppedCount = aiReview.length
  }

  const carriedEvents = [...autoKeep, ...aiKept].map(toCarriedEvent)
  const { events, droppedCount: capDroppedCount } = trimToEventCaps(
    mergedNewEvents,
    carriedEvents,
  )

  const carriedForwardCount = events.filter(
    (event) => event.carriedForward,
  ).length

  return {
    events,
    stats: {
      priorEventCount,
      matchedCount,
      carriedForwardCount,
      reconcileDroppedCount:
        autoDrop.length + aiDroppedCount + capDroppedCount,
      reconcileAiReviewCount: aiReview.length,
    },
  }
}
