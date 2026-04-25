import { v } from "convex/values"

import { internalMutation, internalQuery } from "./_generated/server"
import {
  catalystStatusValidator,
  datePrecisionValidator,
  eventTypeValidator,
  expectedImpactValidator,
} from "./schema"

const sourceInput = v.object({
  url: v.string(),
  title: v.string(),
  publisher: v.string(),
  publishedAt: v.optional(v.string()),
  quote: v.string(),
  supportsFields: v.array(v.string()),
})

const eventInput = v.object({
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
  sources: v.array(sourceInput),
})

export const getRun = internalQuery({
  args: {
    runId: v.id("researchRuns"),
  },
  returns: v.union(
    v.object({
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
      status: v.union(
        v.literal("queued"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed"),
      ),
      error: v.optional(v.string()),
      model: v.optional(v.string()),
      costCents: v.optional(v.number()),
      attemptCount: v.number(),
      cacheHit: v.boolean(),
      startedAt: v.number(),
      completedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId)
  },
})

export const markStarted = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    model: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "running",
      model: args.model,
      attemptCount: 1,
      updatedAt: Date.now(),
    })

    return null
  },
})

export const markFailed = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now()

    await ctx.db.patch(args.runId, {
      status: "failed",
      error: args.error,
      completedAt: now,
      updatedAt: now,
    })

    return null
  },
})

export const upsertResearchResults = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    symbol: v.string(),
    companyName: v.optional(v.string()),
    exchange: v.optional(v.string()),
    events: v.array(eventInput),
    costCents: v.optional(v.number()),
    model: v.optional(v.string()),
  },
  returns: v.array(v.id("catalystEvents")),
  handler: async (ctx, args) => {
    const now = Date.now()
    let stock = await ctx.db
      .query("stocks")
      .withIndex("by_symbol", (q) => q.eq("symbol", args.symbol))
      .unique()

    if (!stock) {
      const stockId = await ctx.db.insert("stocks", {
        symbol: args.symbol,
        companyName: args.companyName,
        exchange: args.exchange,
        lastRefreshedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      stock = await ctx.db.get(stockId)
    } else {
      await ctx.db.patch(stock._id, {
        companyName: args.companyName ?? stock.companyName,
        exchange: args.exchange ?? stock.exchange,
        lastRefreshedAt: now,
        updatedAt: now,
      })
    }

    if (!stock) {
      throw new Error("Unable to upsert stock")
    }

    const eventIds = []

    for (const event of args.events) {
      const eventId = await ctx.db.insert("catalystEvents", {
        stockId: stock._id,
        sourceRunId: args.runId,
        symbol: args.symbol,
        title: event.title,
        summary: event.summary,
        whyItMatters: event.whyItMatters,
        eventType: event.eventType,
        expectedDate: event.expectedDate,
        windowStart: event.windowStart,
        windowEnd: event.windowEnd,
        datePrecision: event.datePrecision,
        confidence: event.confidence,
        status: event.status,
        expectedImpact: event.expectedImpact,
        sourceCount: event.sources.length,
        lastVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      })

      for (const source of event.sources) {
        await ctx.db.insert("eventSources", {
          eventId,
          url: source.url,
          title: source.title,
          publisher: source.publisher,
          publishedAt: source.publishedAt,
          accessedAt: now,
          quote: source.quote,
          supportsFields: source.supportsFields,
        })
      }

      eventIds.push(eventId)
    }

    await ctx.db.patch(args.runId, {
      status: "completed",
      model: args.model,
      costCents: args.costCents,
      completedAt: now,
      updatedAt: now,
    })

    return eventIds
  },
})

export const queueTrackedRefreshes = internalMutation({
  args: {
    now: v.number(),
  },
  returns: v.array(v.id("researchRuns")),
  handler: async (ctx, args) => {
    const staleBefore = args.now - 7 * 24 * 60 * 60 * 1000
    const trackedStocks = await ctx.db.query("portfolioStocks").collect()
    const queuedRunIds = []
    const queuedSymbols = new Set<string>()

    for (const trackedStock of trackedStocks) {
      if (trackedStock.status !== "active" || queuedSymbols.has(trackedStock.symbol)) {
        continue
      }

      const stock = trackedStock.stockId
        ? await ctx.db.get(trackedStock.stockId)
        : await ctx.db
            .query("stocks")
            .withIndex("by_symbol", (q) => q.eq("symbol", trackedStock.symbol))
            .unique()

      if (stock?.lastRefreshedAt && stock.lastRefreshedAt > staleBefore) {
        continue
      }

      const runId = await ctx.db.insert("researchRuns", {
        source: "refresh",
        symbol: trackedStock.symbol,
        status: "queued",
        attemptCount: 0,
        cacheHit: false,
        startedAt: args.now,
        createdAt: args.now,
        updatedAt: args.now,
      })

      queuedSymbols.add(trackedStock.symbol)
      queuedRunIds.push(runId)
    }

    return queuedRunIds
  },
})
