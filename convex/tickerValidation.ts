import { v } from "convex/values"

import { internalMutation, internalQuery } from "./_generated/server"

const tickerValidationReturn = v.object({
  _id: v.id("tickerValidations"),
  _creationTime: v.number(),
  symbol: v.string(),
  isValid: v.boolean(),
  companyName: v.optional(v.string()),
  exchange: v.optional(v.string()),
  provider: v.string(),
  validatedAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const getCached = internalQuery({
  args: {
    symbol: v.string(),
    provider: v.string(),
    now: v.number(),
    validTtlMs: v.number(),
    invalidTtlMs: v.number(),
  },
  returns: v.union(tickerValidationReturn, v.null()),
  handler: async (ctx, args) => {
    const validation = await ctx.db
      .query("tickerValidations")
      .withIndex("by_symbol", (q) => q.eq("symbol", args.symbol))
      .unique()

    if (!validation) {
      return null
    }

    if (validation.provider !== args.provider) {
      return null
    }

    const ttlMs = validation.isValid ? args.validTtlMs : args.invalidTtlMs

    if (validation.validatedAt <= args.now - ttlMs) {
      return null
    }

    return validation
  },
})

export const record = internalMutation({
  args: {
    symbol: v.string(),
    isValid: v.boolean(),
    companyName: v.optional(v.string()),
    exchange: v.optional(v.string()),
    provider: v.string(),
    validatedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tickerValidations")
      .withIndex("by_symbol", (q) => q.eq("symbol", args.symbol))
      .unique()
    const now = args.validatedAt

    if (existing) {
      await ctx.db.patch(existing._id, {
        isValid: args.isValid,
        companyName: args.companyName,
        exchange: args.exchange,
        provider: args.provider,
        validatedAt: now,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert("tickerValidations", {
        symbol: args.symbol,
        isValid: args.isValid,
        companyName: args.companyName,
        exchange: args.exchange,
        provider: args.provider,
        validatedAt: now,
        createdAt: now,
        updatedAt: now,
      })
    }

    if (!args.isValid) {
      return null
    }

    const stock = await ctx.db
      .query("stocks")
      .withIndex("by_symbol", (q) => q.eq("symbol", args.symbol))
      .unique()

    if (stock) {
      await ctx.db.patch(stock._id, {
        companyName: args.companyName ?? stock.companyName,
        exchange: args.exchange ?? stock.exchange,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert("stocks", {
        symbol: args.symbol,
        companyName: args.companyName,
        exchange: args.exchange,
        createdAt: now,
        updatedAt: now,
      })
    }

    return null
  },
})
