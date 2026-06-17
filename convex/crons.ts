import { cronJobs } from "convex/server"

import { internal } from "./_generated/api"

const crons = cronJobs()

crons.daily(
  "refresh stale tracked catalyst research",
  { hourUTC: 8, minuteUTC: 0 },
  internal.researchActions.refreshTrackedStocks,
)

crons.interval(
  "refresh market tape quotes",
  { minutes: 15 },
  internal.marketTapeActions.refreshMarketTape,
  {},
)

export default crons
