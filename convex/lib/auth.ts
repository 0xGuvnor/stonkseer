import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"

type AuthCtx = QueryCtx | MutationCtx

export async function getCurrentUserOrNull(
  ctx: AuthCtx,
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity) {
    return null
  }

  return await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique()
}

export async function getCurrentUser(ctx: AuthCtx): Promise<Doc<"users">> {
  const user = await getCurrentUserOrNull(ctx)

  if (!user) {
    throw new Error("Not authenticated")
  }

  return user
}

export async function requirePortfolioOwner(
  ctx: AuthCtx,
  portfolioId: Id<"portfolios">,
): Promise<{ user: Doc<"users">; portfolio: Doc<"portfolios"> }> {
  const user = await getCurrentUser(ctx)
  const portfolio = await ctx.db.get(portfolioId)

  if (!portfolio) {
    throw new Error("Portfolio not found")
  }

  if (portfolio.userId !== user._id) {
    throw new Error("Unauthorized")
  }

  return { user, portfolio }
}
