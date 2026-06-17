import type { Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import type {
  catalystStatusValidator,
  datePrecisionValidator,
  eventTypeValidator,
  expectedImpactValidator,
  timingShapeValidator,
} from "../schema"
import type { Infer } from "convex/values"

export type CatalystEventInput = {
  title: string
  summary: string
  whyItMatters: string
  eventType: Infer<typeof eventTypeValidator>
  expectedDate?: string
  windowStart?: string
  windowEnd?: string
  periodKey?: string
  timingShape: Infer<typeof timingShapeValidator>
  datePrecision: Infer<typeof datePrecisionValidator>
  confidence: number
  status: Infer<typeof catalystStatusValidator>
  expectedImpact: Infer<typeof expectedImpactValidator>
  sources: Array<{
    url: string
    title: string
    publisher: string
    publishedAt?: string
    quote: string
    supportsFields: string[]
    provenance?: string
  }>
}

export async function deleteCatalystEventsForStock(
  ctx: MutationCtx,
  stockId: Id<"stocks">,
): Promise<void> {
  const events = await ctx.db
    .query("catalystEvents")
    .withIndex("by_stock", (q) => q.eq("stockId", stockId))
    .collect()

  for (const event of events) {
    const sources = await ctx.db
      .query("eventSources")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect()

    for (const source of sources) {
      await ctx.db.delete(source._id)
    }

    await ctx.db.delete(event._id)
  }
}

export async function insertCatalystEventsForStock(
  ctx: MutationCtx,
  args: {
    stockId: Id<"stocks">
    runId: Id<"researchRuns">
    symbol: string
    events: CatalystEventInput[]
    now: number
  },
): Promise<Id<"catalystEvents">[]> {
  const eventIds: Id<"catalystEvents">[] = []

  for (const event of args.events) {
    const eventId = await ctx.db.insert("catalystEvents", {
      stockId: args.stockId,
      sourceRunId: args.runId,
      symbol: args.symbol,
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
      sourceCount: event.sources.length,
      lastVerifiedAt: args.now,
      createdAt: args.now,
      updatedAt: args.now,
    })

    for (const source of event.sources) {
      await ctx.db.insert("eventSources", {
        eventId,
        url: source.url,
        title: source.title,
        publisher: source.publisher,
        publishedAt: source.publishedAt,
        accessedAt: args.now,
        quote: source.quote,
        supportsFields: source.supportsFields,
        provenance: source.provenance,
      })
    }

    eventIds.push(eventId)
  }

  return eventIds
}

export async function loadCatalystEventsWithSources(
  ctx: QueryCtx,
  stockId: Id<"stocks">,
) {
  const events = await ctx.db
    .query("catalystEvents")
    .withIndex("by_stock", (q) => q.eq("stockId", stockId))
    .collect()

  const eventsWithSources = []

  for (const event of events) {
    const sources = await ctx.db
      .query("eventSources")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect()

    eventsWithSources.push({ ...event, sources })
  }

  return eventsWithSources
}

export async function resolveStockIdForSymbol(
  ctx: QueryCtx,
  symbol: string,
): Promise<Id<"stocks"> | null> {
  const stock = await ctx.db
    .query("stocks")
    .withIndex("by_symbol", (q) => q.eq("symbol", symbol))
    .unique()

  return stock?._id ?? null
}

export async function markPortfolioStocksResearchRefreshed(
  ctx: MutationCtx,
  symbol: string,
  now: number,
): Promise<void> {
  const portfolioStocks = await ctx.db
    .query("portfolioStocks")
    .withIndex("by_symbol", (q) => q.eq("symbol", symbol))
    .collect()

  for (const portfolioStock of portfolioStocks) {
    if (portfolioStock.status !== "active") {
      continue
    }

    await ctx.db.patch(portfolioStock._id, {
      lastPortfolioRefreshAt: now,
      updatedAt: now,
    })
  }
}
