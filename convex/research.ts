import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { internalMutation, query } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import {
  catalystStatusValidator,
  datePrecisionValidator,
  eventTypeValidator,
  expectedImpactValidator,
  researchStatusValidator,
} from "./schema"
import {
  getCurrentUser,
  getCurrentUserOrNull,
  getOrCreateCurrentUser,
} from "./lib/auth"
import {
  isTickerSymbolSyntaxValid,
  normalizeTickerSymbol,
} from "../lib/ticker-symbol"
import { RESEARCH_STRATEGY_VERSION } from "../lib/research-strategy"

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const AUTHENTICATED_DAILY_RUN_LIMIT = 10
const AUTHENTICATED_CONCURRENT_RUN_LIMIT = 2

const symbolValidator = v.string()
type ResearchStatus = "queued" | "running" | "completed" | "failed"

const researchRunReturn = v.object({
  _id: v.id("researchRuns"),
  _creationTime: v.number(),
  userId: v.optional(v.id("users")),
  anonymousTokenHash: v.optional(v.string()),
  anonymousIpHash: v.optional(v.string()),
  source: v.union(
    v.literal("anonymous"),
    v.literal("authenticated"),
    v.literal("refresh"),
  ),
  symbol: v.string(),
  status: researchStatusValidator,
  error: v.optional(v.string()),
  model: v.optional(v.string()),
  researchStrategyVersion: v.optional(v.string()),
  costCents: v.optional(v.number()),
  attemptCount: v.number(),
  cacheHit: v.boolean(),
  cacheSourceRunId: v.optional(v.id("researchRuns")),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const sourceReturn = v.object({
  _id: v.id("eventSources"),
  _creationTime: v.number(),
  eventId: v.id("catalystEvents"),
  url: v.string(),
  title: v.string(),
  publisher: v.string(),
  publishedAt: v.optional(v.string()),
  accessedAt: v.number(),
  quote: v.string(),
  supportsFields: v.array(v.string()),
})

const eventWithSourcesReturn = v.object({
  _id: v.id("catalystEvents"),
  _creationTime: v.number(),
  stockId: v.optional(v.id("stocks")),
  sourceRunId: v.optional(v.id("researchRuns")),
  symbol: v.string(),
  title: v.string(),
  summary: v.string(),
  whyItMatters: v.string(),
  eventType: eventTypeValidator,
  expectedDate: v.optional(v.string()),
  windowStart: v.optional(v.string()),
  windowEnd: v.optional(v.string()),
  datePrecision: datePrecisionValidator,
  confidence: v.number(),
  status: catalystStatusValidator,
  expectedImpact: expectedImpactValidator,
  sourceCount: v.number(),
  lastVerifiedAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  sources: v.array(sourceReturn),
})

async function assertAuthenticatedBudget(
  ctx: MutationCtx,
  userId: Id<"users">,
  now: number,
) {
  const userRuns = await ctx.db
    .query("researchRuns")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect()
  const dailyRunCount = userRuns.filter(
    (run) => run.createdAt > now - ONE_DAY_MS && !run.cacheHit,
  ).length
  const activeRunCount = userRuns.filter(
    (run) => run.status === "queued" || run.status === "running",
  ).length

  if (dailyRunCount >= AUTHENTICATED_DAILY_RUN_LIMIT) {
    throw new Error("Daily research limit reached")
  }

  if (activeRunCount >= AUTHENTICATED_CONCURRENT_RUN_LIMIT) {
    throw new Error("Too many research runs are already in progress")
  }
}

function assertValidSymbol(symbol: string) {
  if (!isTickerSymbolSyntaxValid(symbol)) {
    throw new Error("Enter a valid ticker symbol")
  }
}

async function getFreshCompletedRunId(
  ctx: MutationCtx,
  symbol: string,
  now: number,
): Promise<Id<"researchRuns"> | null> {
  const runs = await ctx.db
    .query("researchRuns")
    .withIndex("by_symbol_and_status", (q) =>
      q.eq("symbol", symbol).eq("status", "completed"),
    )
    .collect()

  const freshRuns = runs
    .filter(
      (run) =>
        run.completedAt !== undefined &&
        run.completedAt > now - ONE_DAY_MS &&
        run.researchStrategyVersion === RESEARCH_STRATEGY_VERSION,
    )
    .sort(
      (a, b) =>
        (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt),
    )

  return freshRuns[0]?._id ?? null
}

async function listEventsForRun(ctx: MutationCtx, runId: Id<"researchRuns">) {
  return await ctx.db
    .query("catalystEvents")
    .withIndex("by_sourceRun", (q) => q.eq("sourceRunId", runId))
    .take(1)
}

async function isUsableCacheRun(
  ctx: MutationCtx,
  runId: Id<"researchRuns"> | null,
) {
  if (!runId) {
    return false
  }

  const events = await listEventsForRun(ctx, runId)

  return events.length > 0
}

async function getUsableFreshCompletedRunId(
  ctx: MutationCtx,
  symbol: string,
  now: number,
) {
  const runId = await getFreshCompletedRunId(ctx, symbol, now)

  return (await isUsableCacheRun(ctx, runId)) ? runId : null
}

export const requestAuthenticatedRun = internalMutation({
  args: {
    symbol: symbolValidator,
    now: v.number(),
  },
  returns: v.object({
    runId: v.id("researchRuns"),
    status: researchStatusValidator,
    cacheHit: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx)
    const symbol = normalizeTickerSymbol(args.symbol)
    assertValidSymbol(symbol)

    const cacheSourceRunId = await getUsableFreshCompletedRunId(
      ctx,
      symbol,
      args.now,
    )
    const cacheHit = cacheSourceRunId !== null
    if (!cacheHit) {
      await assertAuthenticatedBudget(ctx, user._id, args.now)
    }

    const runId = await ctx.db.insert("researchRuns", {
      userId: user._id,
      source: "authenticated",
      symbol,
      status: cacheHit ? "completed" : "queued",
      cacheHit,
      cacheSourceRunId: cacheSourceRunId ?? undefined,
      researchStrategyVersion: RESEARCH_STRATEGY_VERSION,
      attemptCount: 0,
      startedAt: args.now,
      completedAt: cacheHit ? args.now : undefined,
      createdAt: args.now,
      updatedAt: args.now,
    })

    if (!cacheHit) {
      await ctx.scheduler.runAfter(0, internal.researchActions.runResearch, {
        runId,
      })
    }

    const status: ResearchStatus = cacheHit ? "completed" : "queued"

    return { runId, status, cacheHit }
  },
})

export const requestAnonymousRun = internalMutation({
  args: {
    symbol: symbolValidator,
    anonymousTokenHash: v.string(),
    anonymousIpHash: v.string(),
    dayKey: v.string(),
    now: v.number(),
  },
  returns: v.object({
    runId: v.id("researchRuns"),
    status: researchStatusValidator,
    cacheHit: v.boolean(),
    remainingAnonymousRuns: v.number(),
  }),
  handler: async (ctx, args) => {
    const symbol = normalizeTickerSymbol(args.symbol)
    assertValidSymbol(symbol)

    const cacheSourceRunId = await getUsableFreshCompletedRunId(
      ctx,
      symbol,
      args.now,
    )
    const cacheHit = cacheSourceRunId !== null

    if (!cacheHit) {
      const ipUsage = await ctx.db
        .query("anonymousUsage")
        .withIndex("by_day_and_ip", (q) =>
          q.eq("dayKey", args.dayKey).eq("ipHash", args.anonymousIpHash),
        )
        .collect()
      const tokenUsage = await ctx.db
        .query("anonymousUsage")
        .withIndex("by_day_and_token", (q) =>
          q.eq("dayKey", args.dayKey).eq("tokenHash", args.anonymousTokenHash),
        )
        .collect()

      const ipRunCount = ipUsage.reduce((sum, usage) => sum + usage.runCount, 0)
      const tokenRunCount = tokenUsage.reduce(
        (sum, usage) => sum + usage.runCount,
        0,
      )

      if (ipRunCount >= 1 || tokenRunCount >= 1) {
        throw new Error("Anonymous trial limit reached for today")
      }

      await ctx.db.insert("anonymousUsage", {
        dayKey: args.dayKey,
        ipHash: args.anonymousIpHash,
        tokenHash: args.anonymousTokenHash,
        runCount: 1,
        createdAt: args.now,
        updatedAt: args.now,
      })
    }

    const runId = await ctx.db.insert("researchRuns", {
      anonymousTokenHash: args.anonymousTokenHash,
      anonymousIpHash: args.anonymousIpHash,
      source: "anonymous",
      symbol,
      status: cacheHit ? "completed" : "queued",
      cacheHit,
      cacheSourceRunId: cacheSourceRunId ?? undefined,
      researchStrategyVersion: RESEARCH_STRATEGY_VERSION,
      attemptCount: 0,
      startedAt: args.now,
      completedAt: cacheHit ? args.now : undefined,
      createdAt: args.now,
      updatedAt: args.now,
    })

    if (!cacheHit) {
      await ctx.scheduler.runAfter(0, internal.researchActions.runResearch, {
        runId,
      })
    }

    const status: ResearchStatus = cacheHit ? "completed" : "queued"

    return {
      runId,
      status,
      cacheHit,
      remainingAnonymousRuns: cacheHit ? 1 : 0,
    }
  },
})

export const getRunResults = query({
  args: {
    runId: v.id("researchRuns"),
    anonymousTokenHash: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      run: researchRunReturn,
      events: v.array(eventWithSourcesReturn),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)

    if (!run) {
      return null
    }

    const user = await getCurrentUserOrNull(ctx)

    if (run.userId) {
      if (!user || user._id !== run.userId) {
        throw new Error("Unauthorized")
      }
    } else if (run.anonymousTokenHash !== args.anonymousTokenHash) {
      throw new Error("Unauthorized")
    }

    let events = await ctx.db
      .query("catalystEvents")
      .withIndex("by_sourceRun", (q) => q.eq("sourceRunId", run._id))
      .collect()

    if (events.length === 0 && run.cacheHit && run.cacheSourceRunId) {
      events = await ctx.db
        .query("catalystEvents")
        .withIndex("by_sourceRun", (q) =>
          q.eq("sourceRunId", run.cacheSourceRunId),
        )
        .collect()
    }

    const eventsWithSources = []

    for (const event of events) {
      const sources = await ctx.db
        .query("eventSources")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect()

      eventsWithSources.push({ ...event, sources })
    }

    return { run, events: eventsWithSources }
  },
})

export const listUpcomingForPortfolio = query({
  args: {
    portfolioId: v.id("portfolios"),
  },
  returns: v.array(eventWithSourcesReturn),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const portfolio = await ctx.db.get(args.portfolioId)

    if (!portfolio || portfolio.userId !== user._id) {
      throw new Error("Unauthorized")
    }

    const trackedEvents = await ctx.db
      .query("trackedEvents")
      .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolio._id))
      .collect()
    const eventsWithSources = []

    for (const trackedEvent of trackedEvents) {
      const event = await ctx.db.get(trackedEvent.eventId)

      if (!event) {
        continue
      }

      const sources = await ctx.db
        .query("eventSources")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect()

      eventsWithSources.push({ ...event, sources })
    }

    return eventsWithSources
  },
})
