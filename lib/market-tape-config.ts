export type MarketTapeItem = {
  label: string
  price: number
  changePct: number
}

export type MarketTapeSymbolConfig = {
  label: string
  /** US stock/ETF symbol for Finnhub /quote (free tier: US equities only). */
  finnhubSymbol: string
  sortOrder: number
}

/** Finnhub free /quote supports US stocks only — indices and crypto use ETF proxies. */
export const MARKET_TAPE_SYMBOLS: readonly MarketTapeSymbolConfig[] = [
  { label: "S&P 500", finnhubSymbol: "SPY", sortOrder: 0 },
  { label: "NASDAQ", finnhubSymbol: "QQQ", sortOrder: 1 },
  { label: "DOW", finnhubSymbol: "DIA", sortOrder: 2 },
  { label: "VIX", finnhubSymbol: "VIXY", sortOrder: 3 },
  { label: "BTC", finnhubSymbol: "IBIT", sortOrder: 4 },
  { label: "ETH", finnhubSymbol: "ETHA", sortOrder: 5 },
  { label: "AAPL", finnhubSymbol: "AAPL", sortOrder: 6 },
  { label: "TSLA", finnhubSymbol: "TSLA", sortOrder: 7 },
  { label: "NVDA", finnhubSymbol: "NVDA", sortOrder: 8 },
  { label: "AMD", finnhubSymbol: "AMD", sortOrder: 9 },
  { label: "MSFT", finnhubSymbol: "MSFT", sortOrder: 10 },
  { label: "SPCX", finnhubSymbol: "SPCX", sortOrder: 11 },
  { label: "PLTR", finnhubSymbol: "PLTR", sortOrder: 12 },
] as const

/** Static placeholders until the first Finnhub snapshot is available. */
export const FALLBACK_MARKET_TAPE: readonly MarketTapeItem[] = [
  { label: "S&P 500", price: 598.42, changePct: 0.41 },
  { label: "NASDAQ", price: 512.18, changePct: 0.73 },
  { label: "DOW", price: 428.65, changePct: -0.28 },
  { label: "VIX", price: 28.14, changePct: -1.84 },
  { label: "BTC", price: 42.31, changePct: 2.12 },
  { label: "ETH", price: 24.87, changePct: 1.34 },
  { label: "AAPL", price: 198.42, changePct: 0.52 },
  { label: "TSLA", price: 342.18, changePct: -1.15 },
  { label: "NVDA", price: 142.65, changePct: 1.88 },
  { label: "AMD", price: 118.34, changePct: 0.67 },
  { label: "MSFT", price: 478.91, changePct: 0.29 },
  { label: "SPCX", price: 160.95, changePct: 0.0 },
  { label: "PLTR", price: 124.73, changePct: 2.41 },
] as const
