export type MarketTapeItem = {
  symbol: string
  price: number
  changePct: number
}

export type MarketTapeSymbolConfig = {
  /** US stock/ETF symbol for Finnhub /quote and tape display. */
  symbol: string
  sortOrder: number
}

/** Finnhub free /quote supports US stocks only — macro/crypto use ETF proxies. */
export const MARKET_TAPE_SYMBOLS: readonly MarketTapeSymbolConfig[] = [
  { symbol: "SPY", sortOrder: 0 },
  { symbol: "QQQ", sortOrder: 1 },
  { symbol: "DIA", sortOrder: 2 },
  { symbol: "VIXY", sortOrder: 3 },
  { symbol: "IBIT", sortOrder: 4 },
  { symbol: "ETHA", sortOrder: 5 },
  { symbol: "AAPL", sortOrder: 6 },
  { symbol: "TSLA", sortOrder: 7 },
  { symbol: "NVDA", sortOrder: 8 },
  { symbol: "AMD", sortOrder: 9 },
  { symbol: "MSFT", sortOrder: 10 },
  { symbol: "SPCX", sortOrder: 11 },
  { symbol: "PLTR", sortOrder: 12 },
] as const

/** Static placeholders until the first Finnhub snapshot is available. */
export const FALLBACK_MARKET_TAPE: readonly MarketTapeItem[] = [
  { symbol: "SPY", price: 598.42, changePct: 0.41 },
  { symbol: "QQQ", price: 512.18, changePct: 0.73 },
  { symbol: "DIA", price: 428.65, changePct: -0.28 },
  { symbol: "VIXY", price: 28.14, changePct: -1.84 },
  { symbol: "IBIT", price: 42.31, changePct: 2.12 },
  { symbol: "ETHA", price: 24.87, changePct: 1.34 },
  { symbol: "AAPL", price: 198.42, changePct: 0.52 },
  { symbol: "TSLA", price: 342.18, changePct: -1.15 },
  { symbol: "NVDA", price: 142.65, changePct: 1.88 },
  { symbol: "AMD", price: 118.34, changePct: 0.67 },
  { symbol: "MSFT", price: 478.91, changePct: 0.29 },
  { symbol: "SPCX", price: 160.95, changePct: 0.0 },
  { symbol: "PLTR", price: 124.73, changePct: 2.41 },
] as const
