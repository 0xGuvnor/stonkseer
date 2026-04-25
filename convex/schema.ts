import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export const eventTypeValidator = v.union(
  v.literal("earnings"),
  v.literal("product"),
  v.literal("regulatory"),
  v.literal("launch"),
  v.literal("investor_day"),
  v.literal("conference"),
  v.literal("partnership"),
  v.literal("corporate"),
  v.literal("macro"),
  v.literal("legal"),
  v.literal("other"),
)

export const datePrecisionValidator = v.union(
  v.literal("exact"),
  v.literal("month"),
  v.literal("quarter"),
  v.literal("half"),
  v.literal("unknown"),
)

export const catalystStatusValidator = v.union(
  v.literal("confirmed"),
  v.literal("likely"),
  v.literal("speculative"),
)

export const expectedImpactValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
)

export const researchStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
)

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    email: v.string(),
    name: v.string(),
    imageUrl: v.optional(v.string()),
    role: v.union(v.literal("user"), v.literal("admin")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  portfolios: defineTable({
    userId: v.id("users"),
    name: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_name", ["userId", "name"]),

  stocks: defineTable({
    symbol: v.string(),
    companyName: v.optional(v.string()),
    exchange: v.optional(v.string()),
    lastRefreshedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_symbol", ["symbol"])
    .index("by_lastRefreshedAt", ["lastRefreshedAt"]),

  tickerValidations: defineTable({
    symbol: v.string(),
    isValid: v.boolean(),
    companyName: v.optional(v.string()),
    exchange: v.optional(v.string()),
    provider: v.string(),
    validatedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_symbol", ["symbol"]),

  portfolioStocks: defineTable({
    portfolioId: v.id("portfolios"),
    userId: v.id("users"),
    stockId: v.optional(v.id("stocks")),
    symbol: v.string(),
    status: v.union(v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_portfolio", ["portfolioId"])
    .index("by_user", ["userId"])
    .index("by_symbol", ["symbol"])
    .index("by_user_and_symbol", ["userId", "symbol"])
    .index("by_portfolio_and_symbol", ["portfolioId", "symbol"]),

  researchRuns: defineTable({
    userId: v.optional(v.id("users")),
    anonymousTokenHash: v.optional(v.string()),
    anonymousIpHash: v.optional(v.string()),
    source: v.union(
      v.literal("anonymous"),
      v.literal("authenticated"),
      v.literal("refresh"),
    ),
    symbol: v.string(),
    status: researchStatusValidator,
    error: v.optional(v.string()),
    model: v.optional(v.string()),
    researchStrategyVersion: v.optional(v.string()),
    costCents: v.optional(v.number()),
    attemptCount: v.number(),
    cacheHit: v.boolean(),
    cacheSourceRunId: v.optional(v.id("researchRuns")),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_anonymousTokenHash", ["anonymousTokenHash"])
    .index("by_symbol", ["symbol"])
    .index("by_status", ["status"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_symbol_and_status", ["symbol", "status"]),

  anonymousUsage: defineTable({
    dayKey: v.string(),
    ipHash: v.string(),
    tokenHash: v.string(),
    runCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_day_and_ip", ["dayKey", "ipHash"])
    .index("by_day_and_token", ["dayKey", "tokenHash"]),

  catalystEvents: defineTable({
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
    datePrecision: datePrecisionValidator,
    confidence: v.number(),
    status: catalystStatusValidator,
    expectedImpact: expectedImpactValidator,
    sourceCount: v.number(),
    lastVerifiedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_stock", ["stockId"])
    .index("by_symbol", ["symbol"])
    .index("by_sourceRun", ["sourceRunId"])
    .index("by_expectedDate", ["expectedDate"])
    .index("by_status_and_expectedDate", ["status", "expectedDate"]),

  eventSources: defineTable({
    eventId: v.id("catalystEvents"),
    url: v.string(),
    title: v.string(),
    publisher: v.string(),
    publishedAt: v.optional(v.string()),
    accessedAt: v.number(),
    quote: v.string(),
    supportsFields: v.array(v.string()),
  })
    .index("by_event", ["eventId"])
    .index("by_url", ["url"]),

  trackedEvents: defineTable({
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
    .index("by_user", ["userId"])
    .index("by_portfolio", ["portfolioId"])
    .index("by_event", ["eventId"])
    .index("by_user_and_event", ["userId", "eventId"])
    .index("by_portfolio_and_event", ["portfolioId", "eventId"]),
})
