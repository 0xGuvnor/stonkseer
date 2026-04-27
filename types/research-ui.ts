import type { Id } from "@/convex/_generated/dataModel"

export type EventSourceView = {
  _id: Id<"eventSources">
  url: string
  title: string
  publisher: string
  publishedAt?: string
}

export type CatalystEventView = {
  _id: Id<"catalystEvents">
  title: string
  summary: string
  whyItMatters: string
  eventType: string
  expectedDate?: string
  windowStart?: string
  windowEnd?: string
  datePrecision: string
  confidence: number
  expectedImpact: string
  sources: EventSourceView[]
}

export type PortfolioView = {
  _id: Id<"portfolios">
  name: string
}

export type AnonymousResearchRunSuccess = {
  runId: Id<"researchRuns">
  anonymousTokenHash: string
  status: string
  cacheHit: boolean
  remainingAnonymousRuns: number
}

export type AnonymousResearchRunError = {
  error: string
}

export type AnonymousResearchRunResponse =
  | AnonymousResearchRunSuccess
  | AnonymousResearchRunError
