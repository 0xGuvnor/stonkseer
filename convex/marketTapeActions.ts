"use node"

import { z } from "zod"
import { v } from "convex/values"

import { internal } from "./_generated/api"
import { internalAction } from "./_generated/server"
import { MARKET_TAPE_SYMBOLS } from "../lib/market-tape-config"

const finnhubQuoteSchema = z
  .object({
    c: z.number().optional(),
    dp: z.number().optional(),
  })
  .passthrough()

const missingFinnhubKeyWarned = new Set<string>()

function warnExpectedEnvMissing(envKeyLabel: string, detail: string) {
  if (missingFinnhubKeyWarned.has(envKeyLabel)) {
    return
  }

  missingFinnhubKeyWarned.add(envKeyLabel)
  console.warn(
    `[stonkseer-market-tape] Expected ${envKeyLabel} is not set: ${detail}`,
  )
}

async function fetchFinnhubQuote(
  finnhubSymbol: string,
  apiKey: string,
): Promise<{ price: number; changePct: number } | null> {
  const token = encodeURIComponent(apiKey)
  const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
    finnhubSymbol,
  )}&token=${token}`

  const response = await fetch(quoteUrl, {
    headers: {
      accept: "application/json",
      "user-agent": "stonkseer-market-tape/0.1",
    },
  })

  if (!response.ok) {
    console.warn(
      `[stonkseer-market-tape] Finnhub quote failed for ${finnhubSymbol}: HTTP ${response.status}`,
    )
    return null
  }

  const quoteJson: unknown = await response.json()
  const parsed = finnhubQuoteSchema.safeParse(quoteJson)
  if (!parsed.success) {
    console.warn(
      `[stonkseer-market-tape] Finnhub quote parse failed for ${finnhubSymbol}`,
    )
    return null
  }

  const price = parsed.data.c
  if (typeof price !== "number" || price === 0) {
    console.warn(
      `[stonkseer-market-tape] Finnhub quote missing price for ${finnhubSymbol}`,
    )
    return null
  }

  return {
    price,
    changePct: typeof parsed.data.dp === "number" ? parsed.data.dp : 0,
  }
}

export const refreshMarketTape = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const apiKey = process.env.FINNHUB_API_KEY

    if (!apiKey) {
      warnExpectedEnvMissing(
        "FINNHUB_API_KEY",
        "market tape refresh is skipped until Finnhub is configured",
      )
      return null
    }

    const quoteResults = await Promise.all(
      MARKET_TAPE_SYMBOLS.map(async (entry) => {
        const quote = await fetchFinnhubQuote(entry.symbol, apiKey)
        if (!quote) {
          return null
        }

        return {
          symbol: entry.symbol,
          price: quote.price,
          changePct: quote.changePct,
          sortOrder: entry.sortOrder,
        }
      }),
    )

    const items = quoteResults
      .filter(
        (
          item,
        ): item is {
          symbol: string
          price: number
          changePct: number
          sortOrder: number
        } => item !== null,
      )
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(({ symbol, price, changePct }) => ({ symbol, price, changePct }))

    if (items.length === 0) {
      console.warn(
        "[stonkseer-market-tape] No valid Finnhub quotes returned; snapshot not updated",
      )
      return null
    }

    await ctx.runMutation(internal.marketTapeInternal.upsertSnapshot, {
      items,
      updatedAt: Date.now(),
    })

    return null
  },
})
