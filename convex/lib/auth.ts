import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"

type AuthCtx = QueryCtx | MutationCtx
type UserProfileInput = {
  email?: string
  imageUrl?: string
  name?: string
}

function profileField(value: string | undefined, maxLength: number) {
  const trimmed = value?.trim()

  return trimmed ? trimmed.slice(0, maxLength) : undefined
}

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

export async function getOrCreateCurrentUser(
  ctx: MutationCtx,
  profile?: UserProfileInput,
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity) {
    throw new Error("Not authenticated")
  }

  const now = Date.now()
  const existingUser = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique()

  const profileEmail = profileField(profile?.email, 320)
  const profileImageUrl = profileField(profile?.imageUrl, 2048)
  const profileName = profileField(profile?.name, 120)

  if (existingUser) {
    const userFields = {
      email: identity.email ?? profileEmail ?? existingUser.email,
      name: identity.name ?? profileName ?? existingUser.name,
      imageUrl: identity.pictureUrl ?? profileImageUrl ?? existingUser.imageUrl,
      updatedAt: now,
    }

    await ctx.db.patch(existingUser._id, userFields)

    return {
      ...existingUser,
      ...userFields,
    }
  }

  const userFields = {
    email: identity.email ?? profileEmail ?? "",
    name: identity.name ?? profileName ?? "Stonkseer user",
    imageUrl: identity.pictureUrl ?? profileImageUrl,
    role: "user" as const,
    updatedAt: now,
  }

  const userId = await ctx.db.insert("users", {
    tokenIdentifier: identity.tokenIdentifier,
    ...userFields,
    createdAt: now,
  })
  const user = await ctx.db.get(userId)

  if (!user) {
    throw new Error("Unable to create user")
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
