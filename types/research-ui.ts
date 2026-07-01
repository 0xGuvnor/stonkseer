import type { Id } from "@/convex/_generated/dataModel"
import type { TimingQualifier, TimingShape } from "@/lib/catalyst-timing"

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
  periodKey?: string
  timingQualifier?: TimingQualifier
  timingShape: TimingShape
  datePrecision: string
  confidence: number
  expectedImpact: "low" | "medium" | "high"
  sources: EventSourceView[]
}

export type PortfolioView = {
  _id: Id<"portfolios">
  name: string
}

export type PortfolioNextEventView = {
  title: string
  expectedDate?: string
  windowStart?: string
  windowEnd?: string
  periodKey?: string
  timingQualifier?: TimingQualifier
  timingShape: TimingShape
  datePrecision: string
}

export type PortfolioHoldingView = {
  portfolioStockId: Id<"portfolioStocks">
  symbol: string
  companyName?: string
  catalystCount: number
  nextEvent?: PortfolioNextEventView
  addedAt: number
}

export type PortfolioCatalystEventView = CatalystEventView & {
  symbol: string
}

export type PortfolioPageDataView = {
  portfolio: PortfolioView & {
    _creationTime: number
    userId: Id<"users">
    createdAt: number
    updatedAt: number
  }
  holdings: PortfolioHoldingView[]
  catalysts: PortfolioCatalystEventView[]
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
