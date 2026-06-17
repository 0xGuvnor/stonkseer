import { v } from "convex/values"

import { internalMutation } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { deleteCatalystEventsForStock } from "./lib/catalystEvents"
import { selectNewestCompletedRunId } from "../lib/canonical-catalyst"

/**
 * One-time migration: dedupe catalystEvents per stock to a single canonical run.
 * Run before or after removing trackedEvents from schema:
 * `bunx convex run migrations:migrateCanonicalCatalystEvents`
 */
export const migrateCanonicalCatalystEvents = internalMutation({
  args: {},
  returns: v.object({
    stocksDeduped: v.number(),
    orphanEventsDeleted: v.number(),
  }),
  handler: async (ctx) => {
    const stocks = await ctx.db.query("stocks").collect()
    let stocksDeduped = 0
    let orphanEventsDeleted = 0

    for (const stock of stocks) {
      const events = await ctx.db
        .query("catalystEvents")
        .withIndex("by_stock", (q) => q.eq("stockId", stock._id))
        .collect()

      if (events.length === 0) {
        const symbolEvents = await ctx.db
          .query("catalystEvents")
          .withIndex("by_symbol", (q) => q.eq("symbol", stock.symbol))
          .collect()

        for (const event of symbolEvents) {
          const sources = await ctx.db
            .query("eventSources")
            .withIndex("by_event", (q) => q.eq("eventId", event._id))
            .collect()

          for (const source of sources) {
            await ctx.db.delete(source._id)
          }

          await ctx.db.delete(event._id)
          orphanEventsDeleted += 1
        }

        continue
      }

      const sourceRunIds = new Set(
        events
          .map((event) => event.sourceRunId)
          .filter((runId): runId is Id<"researchRuns"> => runId !== undefined),
      )

      if (sourceRunIds.size <= 1) {
        const canonicalRunId =
          stock.currentSourceRunId ??
          events.find((event) => event.sourceRunId)?.sourceRunId

        if (canonicalRunId && stock.currentSourceRunId !== canonicalRunId) {
          await ctx.db.patch(stock._id, {
            currentSourceRunId: canonicalRunId,
            updatedAt: Date.now(),
          })
        }

        continue
      }

      const runs = await Promise.all(
        [...sourceRunIds].map((runId) => ctx.db.get("researchRuns", runId)),
      )
      const keepRunId =
        selectNewestCompletedRunId(runs) ??
        stock.currentSourceRunId ??
        events.find((event) => event.sourceRunId)?.sourceRunId

      if (!keepRunId) {
        await deleteCatalystEventsForStock(ctx, stock._id)
        stocksDeduped += 1
        continue
      }

      for (const event of events) {
        if (event.sourceRunId === keepRunId) {
          continue
        }

        const sources = await ctx.db
          .query("eventSources")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect()

        for (const source of sources) {
          await ctx.db.delete(source._id)
        }

        await ctx.db.delete(event._id)
        orphanEventsDeleted += 1
      }

      await ctx.db.patch(stock._id, {
        currentSourceRunId: keepRunId,
        updatedAt: Date.now(),
      })
      stocksDeduped += 1
    }

    return {
      stocksDeduped,
      orphanEventsDeleted,
    }
  },
})
