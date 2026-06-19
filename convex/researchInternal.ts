import { v } from "convex/values"

import { internalMutation, internalQuery } from "./_generated/server"
import {
  catalystStatusValidator,
  datePrecisionValidator,
  eventTypeValidator,
  expectedImpactValidator,
  timingShapeValidator,
} from "./schema"
import { RESEARCH_STRATEGY_VERSION } from "../lib/research-strategy"
import { isPortfolioStockDueForRefresh } from "../lib/portfolio-refresh"
import {
  deleteCatalystEventsForStock,
  insertCatalystEventsForStock,
  loadCatalystEventsWithSources,
  markPortfolioStocksResearchRefreshed,
  resolveStockIdForSymbol,
} from "./lib/catalystEvents"

const sourceInput = v.object({
  url: v.string(),
  title: v.string(),
  publisher: v.string(),
  publishedAt: v.optional(v.string()),
  quote: v.string(),
  supportsFields: v.array(v.string()),
  provenance: v.optional(
    v.union(
      v.literal("evidence_snippet"),
      v.literal("report_derived"),
      v.literal("prior_run_carryforward"),
    ),
  ),
})

const eventInput = v.object({
  title: v.string(),
  summary: v.string(),
  whyItMatters: v.string(),
  eventType: eventTypeValidator,
  expectedDate: v.optional(v.string()),
  windowStart: v.optional(v.string()),
  windowEnd: v.optional(v.string()),
  periodKey: v.optional(v.string()),
  timingShape: timingShapeValidator,
  datePrecision: datePrecisionValidator,
  confidence: v.number(),
  status: catalystStatusValidator,
  expectedImpact: expectedImpactValidator,
  sources: v.array(sourceInput),
  createdAt: v.optional(v.number()),
  lastVerifiedAt: v.optional(v.number()),
})

const priorCanonicalEventReturn = v.object({
  title: v.string(),
  summary: v.string(),
  whyItMatters: v.string(),
  eventType: eventTypeValidator,
  expectedDate: v.optional(v.string()),
  windowStart: v.optional(v.string()),
  windowEnd: v.optional(v.string()),
  periodKey: v.optional(v.string()),
  timingShape: timingShapeValidator,
  datePrecision: datePrecisionValidator,
  confidence: v.number(),
  status: catalystStatusValidator,
  expectedImpact: expectedImpactValidator,
  sources: v.array(sourceInput),
  createdAt: v.number(),
  lastVerifiedAt: v.number(),
})

const searchDiagnosticInput = v.object({
  bucket: v.string(),
  query: v.string(),
  includeDomains: v.optional(v.array(v.string())),
  maxResults: v.optional(v.number()),
  resultCount: v.number(),
  keptCount: v.number(),
  urls: v.array(v.string()),
  error: v.optional(v.string()),
  reportChars: v.optional(v.number()),
})

function normalizeSourceProvenance(
  provenance: string | undefined,
):
  | "evidence_snippet"
  | "report_derived"
  | "prior_run_carryforward"
  | undefined {
  if (
    provenance === "evidence_snippet" ||
    provenance === "report_derived" ||
    provenance === "prior_run_carryforward"
  ) {
    return provenance
  }

  return undefined
}

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
      researchStrategyVersion: v.optional(v.string()),
      costCents: v.optional(v.number()),
      attemptCount: v.number(),
      cacheHit: v.boolean(),
      cacheSourceRunId: v.optional(v.id("researchRuns")),
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

export const getPriorCanonicalEvents = internalQuery({
  args: {
    symbol: v.string(),
  },
  returns: v.array(priorCanonicalEventReturn),
  handler: async (ctx, args) => {
    const stockId = await resolveStockIdForSymbol(ctx, args.symbol)

    if (!stockId) {
      return []
    }

    const eventsWithSources = await loadCatalystEventsWithSources(ctx, stockId)

    return eventsWithSources.map((event) => ({
      title: event.title,
      summary: event.summary,
      whyItMatters: event.whyItMatters,
      eventType: event.eventType,
      expectedDate: event.expectedDate,
      windowStart: event.windowStart,
      windowEnd: event.windowEnd,
      periodKey: event.periodKey,
      timingShape: event.timingShape,
      datePrecision: event.datePrecision,
      confidence: event.confidence,
      status: event.status,
      expectedImpact: event.expectedImpact,
      sources: event.sources.map((source) => ({
        url: source.url,
        title: source.title,
        publisher: source.publisher,
        publishedAt: source.publishedAt,
        quote: source.quote,
        supportsFields: source.supportsFields,
        provenance: normalizeSourceProvenance(source.provenance),
      })),
      createdAt: event.createdAt,
      lastVerifiedAt: event.lastVerifiedAt,
    }))
  },
})

export const recordResearchDiagnostics = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    symbol: v.string(),
    searchQueryCount: v.number(),
    snippetCount: v.number(),
    extractionEventCount: v.number(),
    deepReadUrlCount: v.optional(v.number()),
    deepReadSuccessCount: v.optional(v.number()),
    citationDroppedCount: v.optional(v.number()),
    followUpQueryCount: v.optional(v.number()),
    reportDerivedSourceCount: v.optional(v.number()),
    priorEventCount: v.optional(v.number()),
    carriedForwardCount: v.optional(v.number()),
    reconcileDroppedCount: v.optional(v.number()),
    reconcileAiReviewCount: v.optional(v.number()),
    inrunDedupeMergedCount: v.optional(v.number()),
    inrunDedupeAiReviewCount: v.optional(v.number()),
    queries: v.array(searchDiagnosticInput),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("researchDiagnostics", {
      runId: args.runId,
      symbol: args.symbol,
      strategyVersion: RESEARCH_STRATEGY_VERSION,
      searchQueryCount: args.searchQueryCount,
      snippetCount: args.snippetCount,
      extractionEventCount: args.extractionEventCount,
      deepReadUrlCount: args.deepReadUrlCount,
      deepReadSuccessCount: args.deepReadSuccessCount,
      citationDroppedCount: args.citationDroppedCount,
      followUpQueryCount: args.followUpQueryCount,
      reportDerivedSourceCount: args.reportDerivedSourceCount,
      priorEventCount: args.priorEventCount,
      carriedForwardCount: args.carriedForwardCount,
      reconcileDroppedCount: args.reconcileDroppedCount,
      reconcileAiReviewCount: args.reconcileAiReviewCount,
      inrunDedupeMergedCount: args.inrunDedupeMergedCount,
      inrunDedupeAiReviewCount: args.inrunDedupeAiReviewCount,
      queries: args.queries,
      createdAt: Date.now(),
    })

    return null
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

    await deleteCatalystEventsForStock(ctx, stock._id)

    const eventIds = await insertCatalystEventsForStock(ctx, {
      stockId: stock._id,
      runId: args.runId,
      symbol: args.symbol,
      events: args.events,
      now,
    })

    await ctx.db.patch(stock._id, {
      currentSourceRunId: args.runId,
      lastRefreshedAt: now,
      updatedAt: now,
    })

    await markPortfolioStocksResearchRefreshed(ctx, args.symbol, now)

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
    const trackedStocks = await ctx.db.query("portfolioStocks").collect()
    const queuedRunIds = []
    const queuedSymbols = new Set<string>()

    for (const trackedStock of trackedStocks) {
      if (trackedStock.status !== "active") {
        continue
      }

      if (
        !isPortfolioStockDueForRefresh(
          trackedStock.lastPortfolioRefreshAt,
          args.now,
        )
      ) {
        continue
      }

      if (queuedSymbols.has(trackedStock.symbol)) {
        continue
      }

      const runId = await ctx.db.insert("researchRuns", {
        source: "refresh",
        symbol: trackedStock.symbol,
        status: "queued",
        researchStrategyVersion: RESEARCH_STRATEGY_VERSION,
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
