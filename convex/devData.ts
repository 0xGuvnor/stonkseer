import { internalMutation } from "./_generated/server"
import { v } from "convex/values"
import type { TableNames } from "./_generated/dataModel"

/**
 * Every app table from schema.ts (system tables are untouched).
 * Keep this list in sync when adding/removing tables.
 */
const ALL_TABLES: readonly TableNames[] = [
  "anonymousUsage",
  "eventSources",
  "trackedEvents",
  "portfolioStocks",
  "researchDiagnostics",
  "catalystEvents",
  "researchRuns",
  "portfolios",
  "stocks",
  "tickerValidations",
  "users",
]

const BATCH = 400

function assertDevWipeAllowed(): void {
  if (process.env.ALLOW_CONVEX_DEV_WIPE !== "true") {
    throw new Error(
      "Refusing wipe: set ALLOW_CONVEX_DEV_WIPE=true on this Convex deployment (Dashboard → Settings → Environment Variables), then run again.",
    )
  }
}

/**
 * Deletes all documents from every app table. Schema/table definitions are unchanged.
 *
 * Guardrails:
 * - Only runs when deployment env `ALLOW_CONVEX_DEV_WIPE` is exactly `"true"`.
 * - Requires explicit confirm phrase (prevents accidental CLI typos).
 *
 * Run against dev (default CLI deployment; set env first — see assertDevWipeAllowed):\
 * `bun run convex:wipe-dev-rows` or\
 * `bunx convex run devData:wipeAllRowsDev '{"confirmPhrase":"WIPE_ALL_DEV_ROWS"}'`
 */
export const wipeAllRowsDev = internalMutation({
  args: {
    confirmPhrase: v.literal("WIPE_ALL_DEV_ROWS"),
  },
  handler: async (ctx) => {
    assertDevWipeAllowed()

    const deletedByTable: Record<string, number> = {}

    for (const tableName of ALL_TABLES) {
      let total = 0
      while (true) {
        const batch = await ctx.db.query(tableName).take(BATCH)
        if (batch.length === 0) break
        for (const doc of batch) {
          await ctx.db.delete(doc._id)
        }
        total += batch.length
      }
      deletedByTable[tableName] = total
    }

    return { deletedByTable }
  },
})
