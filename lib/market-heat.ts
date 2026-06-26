import type { MarketTapeItem } from "@/lib/market-tape-config"

export const MARKET_HEAT_PROXY_SYMBOLS = ["SPY", "QQQ", "DIA"] as const
export const MARKET_HEAT_FULL_SCALE_PCT = 1.5

export function computeMarketHeat(items: readonly MarketTapeItem[]): number {
  const proxySet = new Set<string>(MARKET_HEAT_PROXY_SYMBOLS)
  const proxies = items.filter((item) => proxySet.has(item.symbol))
  const source = proxies.length > 0 ? proxies : items
  if (source.length === 0) return 0
  const avg =
    source.reduce((sum, item) => sum + item.changePct, 0) / source.length
  return Math.max(-1, Math.min(1, avg / MARKET_HEAT_FULL_SCALE_PCT))
}
