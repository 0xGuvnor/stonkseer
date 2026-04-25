import { v } from "convex/values"

import { mutation, query } from "./_generated/server"
import { getCurrentUser, requirePortfolioOwner } from "./lib/auth"

const portfolioReturn = v.object({
  _id: v.id("portfolios"),
  _creationTime: v.number(),
  userId: v.id("users"),
  name: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const trackedEventReturn = v.object({
  _id: v.id("trackedEvents"),
  _creationTime: v.number(),
  userId: v.id("users"),
  portfolioId: v.id("portfolios"),
  portfolioStockId: v.id("portfolioStocks"),
  eventId: v.id("catalystEvents"),
  notificationPreference: v.union(
    v.literal("none"),
    v.literal("weekly"),
    v.literal("day_before"),
  ),
  createdAt: v.number(),
})

export const listMine = query({
  args: {},
  returns: v.array(portfolioReturn),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)

    return await ctx.db
      .query("portfolios")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()
  },
})

export const create = mutation({
  args: {
    name: v.string(),
  },
  returns: v.id("portfolios"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const name = args.name.trim()

    if (name.length < 1 || name.length > 80) {
      throw new Error("Portfolio name must be between 1 and 80 characters")
    }

    const now = Date.now()

    return await ctx.db.insert("portfolios", {
      userId: user._id,
      name,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const getWithStocks = query({
  args: {
    portfolioId: v.id("portfolios"),
  },
  returns: v.object({
    portfolio: portfolioReturn,
    stocks: v.array(
      v.object({
        _id: v.id("portfolioStocks"),
        _creationTime: v.number(),
        portfolioId: v.id("portfolios"),
        userId: v.id("users"),
        stockId: v.optional(v.id("stocks")),
        symbol: v.string(),
        status: v.union(v.literal("active"), v.literal("archived")),
        createdAt: v.number(),
        updatedAt: v.number(),
      }),
    ),
    trackedEvents: v.array(trackedEventReturn),
  }),
  handler: async (ctx, args) => {
    const { portfolio } = await requirePortfolioOwner(ctx, args.portfolioId)
    const stocks = await ctx.db
      .query("portfolioStocks")
      .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolio._id))
      .collect()
    const trackedEvents = await ctx.db
      .query("trackedEvents")
      .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolio._id))
      .collect()

    return { portfolio, stocks, trackedEvents }
  },
})

export const saveResearchToPortfolio = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    symbol: v.string(),
    eventIds: v.array(v.id("catalystEvents")),
  },
  returns: v.object({
    portfolioStockId: v.id("portfolioStocks"),
    trackedEventIds: v.array(v.id("trackedEvents")),
  }),
  handler: async (ctx, args) => {
    const { user, portfolio } = await requirePortfolioOwner(
      ctx,
      args.portfolioId,
    )
    const symbol = args.symbol.trim().toUpperCase()

    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) {
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

    const portfolioStockId = await ctx.db.insert("portfolioStocks", {
      portfolioId: portfolio._id,
      userId: user._id,
      stockId: stock._id,
      symbol,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })

    const trackedEventIds = []

    for (const eventId of args.eventIds) {
      const event = await ctx.db.get(eventId)

      if (!event || event.symbol !== symbol) {
        throw new Error("Selected event does not match this ticker")
      }

      const trackedEventId = await ctx.db.insert("trackedEvents", {
        userId: user._id,
        portfolioId: portfolio._id,
        portfolioStockId,
        eventId,
        notificationPreference: "none",
        createdAt: now,
      })
      trackedEventIds.push(trackedEventId)
    }

    return { portfolioStockId, trackedEventIds }
  },
})
