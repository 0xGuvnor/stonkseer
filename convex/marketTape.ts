import { v } from "convex/values"

import { query } from "./_generated/server"

const marketTapeItemValidator = v.object({
  label: v.string(),
  price: v.number(),
  changePct: v.number(),
})

export const getSnapshot = query({
  args: {},
  returns: v.union(
    v.object({
      items: v.array(marketTapeItemValidator),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const snapshot = await ctx.db.query("marketTapeSnapshot").first()
    if (!snapshot || snapshot.items.length === 0) {
      return null
    }

    return {
      items: snapshot.items,
      updatedAt: snapshot.updatedAt,
    }
  },
})
