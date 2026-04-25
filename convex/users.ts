import { v } from "convex/values"

import { mutation, query } from "./_generated/server"
import { getCurrentUserOrNull, getOrCreateCurrentUser } from "./lib/auth"

export const store = mutation({
  args: {
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx, args)

    return user._id
  },
})

export const current = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      tokenIdentifier: v.string(),
      email: v.string(),
      name: v.string(),
      imageUrl: v.optional(v.string()),
      role: v.union(v.literal("user"), v.literal("admin")),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    return await getCurrentUserOrNull(ctx)
  },
})
