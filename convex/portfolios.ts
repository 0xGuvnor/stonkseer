import { ConvexError, v } from "convex/values"

import {
  catalystStatusValidator,
  datePrecisionValidator,
  eventTypeValidator,
  expectedImpactValidator,
  timingShapeValidator,
} from "./schema"
import type { Id } from "./_generated/dataModel"
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server"
import {
  getCurrentUserOrNull,
  getOrCreateCurrentUser,
  requirePortfolioOwner,
} from "./lib/auth"
import { lookupCompanyNameForSymbol } from "./lib/companyName"
import {
  loadCatalystEventsWithSources,
  resolveStockIdForSymbol,
} from "./lib/catalystEvents"
import {
  filterUpcomingCatalystEvents,
  findNearestUpcomingEvent,
} from "../lib/portfolio-catalyst-utils"
import {
  isTickerSymbolSyntaxValid,
  normalizeTickerSymbol,
} from "../lib/ticker-symbol"

function validatePortfolioName(name: string) {
  const trimmed = name.trim()

  if (trimmed.length < 1 || trimmed.length > 80) {
    throw new ConvexError("Portfolio name must be between 1 and 80 characters")
  }

  return trimmed
}

async function assertPortfolioNameAvailable(
  ctx: MutationCtx,
  userId: Id<"users">,
  name: string,
  excludePortfolioId?: Id<"portfolios">,
) {
  const existing = await ctx.db
    .query("portfolios")
    .withIndex("by_user_and_name", (q) =>
      q.eq("userId", userId).eq("name", name),
    )
    .first()

  if (existing && existing._id !== excludePortfolioId) {
    const userMessage = "You already have a portfolio with this name"
    console.error("Portfolio name conflict", {
      userId,
      name,
      existingPortfolioId: existing._id,
    })
    throw new ConvexError(userMessage)
  }
}

const portfolioReturn = v.object({
  _id: v.id("portfolios"),
  _creationTime: v.number(),
  userId: v.id("users"),
  name: v.string(),
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
  provenance: v.optional(v.string()),
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
  periodKey: v.optional(v.string()),
  timingShape: timingShapeValidator,
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

const nextEventReturn = v.object({
  title: v.string(),
  expectedDate: v.optional(v.string()),
  windowStart: v.optional(v.string()),
  windowEnd: v.optional(v.string()),
  periodKey: v.optional(v.string()),
  timingShape: timingShapeValidator,
  datePrecision: datePrecisionValidator,
})

const holdingReturn = v.object({
  portfolioStockId: v.id("portfolioStocks"),
  symbol: v.string(),
  companyName: v.optional(v.string()),
  catalystCount: v.number(),
  nextEvent: v.optional(nextEventReturn),
  addedAt: v.number(),
})

const portfolioPageDataReturn = v.object({
  portfolio: portfolioReturn,
  holdings: v.array(holdingReturn),
  catalysts: v.array(eventWithSourcesReturn),
})

async function resolvePortfolioStockId(
  ctx: QueryCtx,
  stockId: Id<"stocks"> | undefined,
  symbol: string,
): Promise<Id<"stocks">> {
  if (stockId) {
    return stockId
  }

  const resolved = await resolveStockIdForSymbol(ctx, symbol)
  if (!resolved) {
    throw new Error("Unable to resolve stock for symbol")
  }

  return resolved
}

export const listMine = query({
  args: {},
  returns: v.array(portfolioReturn),
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx)

    if (!user) {
      return []
    }

    return await ctx.db
      .query("portfolios")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()
  },
})

export const isSymbolInPortfolio = query({
  args: {
    portfolioId: v.id("portfolios"),
    symbol: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { portfolio } = await requirePortfolioOwner(ctx, args.portfolioId)
    const symbol = normalizeTickerSymbol(args.symbol)

    const existingPortfolioStocks = await ctx.db
      .query("portfolioStocks")
      .withIndex("by_portfolio_and_symbol", (q) =>
        q.eq("portfolioId", portfolio._id).eq("symbol", symbol),
      )
      .take(1)

    return existingPortfolioStocks[0] !== undefined
  },
})

export const create = mutation({
  args: {
    name: v.string(),
  },
  returns: v.id("portfolios"),
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx)
    const name = validatePortfolioName(args.name)

    await assertPortfolioNameAvailable(ctx, user._id, name)

    const now = Date.now()

    return await ctx.db.insert("portfolios", {
      userId: user._id,
      name,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const saveResearchToPortfolio = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    symbol: v.string(),
  },
  returns: v.object({
    portfolioStockId: v.id("portfolioStocks"),
    alreadyInPortfolio: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { user, portfolio } = await requirePortfolioOwner(
      ctx,
      args.portfolioId,
    )
    const symbol = normalizeTickerSymbol(args.symbol)

    if (!isTickerSymbolSyntaxValid(symbol)) {
      throw new Error("Enter a valid ticker symbol")
    }

    const now = Date.now()
    let stock = await ctx.db
      .query("stocks")
      .withIndex("by_symbol", (q) => q.eq("symbol", symbol))
      .unique()

    if (!stock) {
      const stockId = await ctx.db.insert("stocks", {
        symbol,
        createdAt: now,
        updatedAt: now,
      })
      stock = await ctx.db.get(stockId)
    }

    if (!stock) {
      throw new Error("Unable to save stock")
    }

    const existingPortfolioStocks = await ctx.db
      .query("portfolioStocks")
      .withIndex("by_portfolio_and_symbol", (q) =>
        q.eq("portfolioId", portfolio._id).eq("symbol", symbol),
      )
      .take(1)
    const alreadyInPortfolio = existingPortfolioStocks[0] !== undefined
    let portfolioStock = existingPortfolioStocks[0]

    if (portfolioStock) {
      await ctx.db.patch(portfolioStock._id, {
        stockId: stock._id,
        status: "active",
        lastPortfolioRefreshAt: now,
        updatedAt: now,
      })
    } else {
      const portfolioStockId = await ctx.db.insert("portfolioStocks", {
        portfolioId: portfolio._id,
        userId: user._id,
        stockId: stock._id,
        symbol,
        status: "active",
        lastPortfolioRefreshAt: now,
        createdAt: now,
        updatedAt: now,
      })
      const insertedPortfolioStock = await ctx.db.get(portfolioStockId)

      if (!insertedPortfolioStock) {
        throw new Error("Unable to save portfolio stock")
      }

      portfolioStock = insertedPortfolioStock
    }

    return {
      portfolioStockId: portfolioStock._id,
      alreadyInPortfolio,
    }
  },
})

export const getPortfolioPageData = query({
  args: {
    portfolioId: v.id("portfolios"),
    now: v.number(),
  },
  returns: portfolioPageDataReturn,
  handler: async (ctx, args) => {
    const { portfolio } = await requirePortfolioOwner(ctx, args.portfolioId)
    const portfolioStocks = await ctx.db
      .query("portfolioStocks")
      .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolio._id))
      .collect()
    const activeStocks = portfolioStocks.filter((stock) => stock.status === "active")

    const allEventsWithSources = []
    const holdings = []

    for (const portfolioStock of activeStocks) {
      const stockId = await resolvePortfolioStockId(
        ctx,
        portfolioStock.stockId,
        portfolioStock.symbol,
      )
      const stockEvents = await loadCatalystEventsWithSources(ctx, stockId)
      allEventsWithSources.push(...stockEvents)

      const nearest = findNearestUpcomingEvent(stockEvents, args.now)
      const companyName = await lookupCompanyNameForSymbol(ctx, portfolioStock.symbol)

      holdings.push({
        portfolioStockId: portfolioStock._id,
        symbol: portfolioStock.symbol,
        companyName,
        catalystCount: stockEvents.length,
        nextEvent: nearest
          ? {
              title: nearest.title,
              expectedDate: nearest.expectedDate,
              windowStart: nearest.windowStart,
              windowEnd: nearest.windowEnd,
              periodKey: nearest.periodKey,
              timingShape: nearest.timingShape,
              datePrecision: nearest.datePrecision,
            }
          : undefined,
        addedAt: portfolioStock.createdAt,
      })
    }

    holdings.sort((a, b) => a.symbol.localeCompare(b.symbol))

    const catalysts = filterUpcomingCatalystEvents(allEventsWithSources, args.now)

    return {
      portfolio,
      holdings,
      catalysts,
    }
  },
})

export const rename = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { portfolio } = await requirePortfolioOwner(ctx, args.portfolioId)
    const name = validatePortfolioName(args.name)

    await assertPortfolioNameAvailable(
      ctx,
      portfolio.userId,
      name,
      portfolio._id,
    )

    await ctx.db.patch(portfolio._id, {
      name,
      updatedAt: Date.now(),
    })

    return null
  },
})

export const remove = mutation({
  args: {
    portfolioId: v.id("portfolios"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { portfolio } = await requirePortfolioOwner(ctx, args.portfolioId)

    const portfolioStocks = await ctx.db
      .query("portfolioStocks")
      .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolio._id))
      .collect()

    for (const portfolioStock of portfolioStocks) {
      await ctx.db.delete(portfolioStock._id)
    }

    await ctx.db.delete(portfolio._id)

    return null
  },
})

export const removeStock = mutation({
  args: {
    portfolioStockId: v.id("portfolioStocks"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const portfolioStock = await ctx.db.get("portfolioStocks", args.portfolioStockId)

    if (!portfolioStock) {
      throw new Error("Portfolio stock not found")
    }

    await requirePortfolioOwner(ctx, portfolioStock.portfolioId)
    await ctx.db.delete(portfolioStock._id)

    return null
  },
})
