export const TICKER_SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/

export function normalizeTickerSymbol(symbol: string) {
  return symbol.trim().toUpperCase()
}

export function isTickerSymbolSyntaxValid(symbol: string) {
  return TICKER_SYMBOL_PATTERN.test(normalizeTickerSymbol(symbol))
}
