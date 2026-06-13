import type { QueryCtx } from "../_generated/server"

export async function lookupCompanyNameForSymbol(
  ctx: QueryCtx,
  symbol: string,
): Promise<string | undefined> {
  const stock = await ctx.db
    .query("stocks")
    .withIndex("by_symbol", (q) => q.eq("symbol", symbol))
    .unique()

  if (stock?.companyName) {
    return stock.companyName
  }

  const validation = await ctx.db
    .query("tickerValidations")
    .withIndex("by_symbol", (q) => q.eq("symbol", symbol))
    .unique()

  return validation?.companyName
}
