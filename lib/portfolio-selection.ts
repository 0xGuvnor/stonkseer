import type { Id } from "@/convex/_generated/dataModel"

export const LAST_PORTFOLIO_ID_KEY = "stonkseer:lastPortfolioId"

export function readLastPortfolioId(): Id<"portfolios"> | null {
  if (typeof window === "undefined") {
    return null
  }

  const value = window.localStorage.getItem(LAST_PORTFOLIO_ID_KEY)
  return value ? (value as Id<"portfolios">) : null
}

export function writeLastPortfolioId(portfolioId: Id<"portfolios">) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(LAST_PORTFOLIO_ID_KEY, portfolioId)
}

export function resolveSelectedPortfolioId(
  portfolios: Array<{ _id: Id<"portfolios">; updatedAt: number }>,
  urlPortfolioId: string | null,
  lastPortfolioId: Id<"portfolios"> | null,
): Id<"portfolios"> | null {
  if (portfolios.length === 0) {
    return null
  }

  const portfolioIds = new Set(portfolios.map((portfolio) => portfolio._id))

  if (urlPortfolioId && portfolioIds.has(urlPortfolioId as Id<"portfolios">)) {
    return urlPortfolioId as Id<"portfolios">
  }

  if (lastPortfolioId && portfolioIds.has(lastPortfolioId)) {
    return lastPortfolioId
  }

  const mostRecent = [...portfolios].sort((a, b) => b.updatedAt - a.updatedAt)[0]
  return mostRecent?._id ?? null
}

export function formatRelativeDate(timestamp: number, now: number): string {
  const diffMs = timestamp - now
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000))
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

  if (Math.abs(diffDays) < 1) {
    const diffHours = Math.round(diffMs / (60 * 60 * 1000))
    if (Math.abs(diffHours) < 1) {
      return "just now"
    }
    return rtf.format(diffHours, "hour")
  }

  if (Math.abs(diffDays) < 30) {
    return rtf.format(diffDays, "day")
  }

  const diffMonths = Math.round(diffDays / 30)
  if (Math.abs(diffMonths) < 12) {
    return rtf.format(diffMonths, "month")
  }

  const diffYears = Math.round(diffDays / 365)
  return rtf.format(diffYears, "year")
}
