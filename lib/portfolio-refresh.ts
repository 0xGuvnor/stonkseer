export const PORTFOLIO_REFRESH_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000

export function isPortfolioStockDueForRefresh(
  lastPortfolioRefreshAt: number | undefined,
  now: number,
): boolean {
  if (lastPortfolioRefreshAt === undefined) {
    return true
  }

  return lastPortfolioRefreshAt <= now - PORTFOLIO_REFRESH_INTERVAL_MS
}
