import type { Id } from "@/convex/_generated/dataModel"

export type EventSourceView = {
  _id: Id<"eventSources">
  url: string
  title: string
  publisher: string
}

export type CatalystEventView = {
  _id: Id<"catalystEvents">
  title: string
  summary: string
  eventType: string
  status: string
  confidence: number
  sources: EventSourceView[]
}

export type PortfolioView = {
  _id: Id<"portfolios">
  name: string
}

export type AnonymousResearchRunSuccess = {
  runId: Id<"researchRuns">
  anonymousTokenHash: string
}

export type AnonymousResearchRunError = {
  error: string
}

export type AnonymousResearchRunResponse =
  | AnonymousResearchRunSuccess
  | AnonymousResearchRunError
