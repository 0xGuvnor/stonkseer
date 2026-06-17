import { v } from "convex/values"

import { internalMutation } from "./_generated/server"

const marketTapeItemValidator = v.object({
  symbol: v.string(),
  price: v.number(),
  changePct: v.number(),
})

export const upsertSnapshot = internalMutation({
  args: {
    items: v.array(marketTapeItemValidator),
    updatedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("marketTapeSnapshot").first()

    if (existing) {
      await ctx.db.patch(existing._id, {
        items: args.items,
        updatedAt: args.updatedAt,
      })
      return null
    }

    await ctx.db.insert("marketTapeSnapshot", {
      items: args.items,
      updatedAt: args.updatedAt,
    })

    return null
  },
})
