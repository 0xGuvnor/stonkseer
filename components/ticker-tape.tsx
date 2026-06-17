"use client"

import { useQuery } from "convex/react"

import { api } from "@/convex/_generated/api"
import { FALLBACK_MARKET_TAPE, type MarketTapeItem } from "@/lib/market-tape-config"
import { cn } from "@/lib/utils"

function formatPrice(price: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatChange(changePct: number): string {
  const sign = changePct >= 0 ? "+" : ""
  return `${sign}${changePct.toFixed(2)}%`
}

function TapeEntry({ item }: { item: MarketTapeItem }) {
  const positive = item.changePct >= 0
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className="text-muted-foreground/80">{item.label}</span>
      <span className="text-foreground/90">{formatPrice(item.price)}</span>
      <span className={cn(positive ? "text-up" : "text-down")}>
        {formatChange(item.changePct)}
      </span>
    </div>
  )
}

export function TickerTape() {
  const snapshot = useQuery(api.marketTape.getSnapshot, {})
  const tapeItems =
    snapshot && snapshot.items.length > 0 ? snapshot.items : FALLBACK_MARKET_TAPE

  // Duplicate the tape so the -50% scroll loops seamlessly.
  const items = [...tapeItems, ...tapeItems]

  return (
    <div className="relative shrink-0 overflow-hidden border-t border-border bg-background/80 py-2">
      <div className="flex w-max animate-ticker gap-8 whitespace-nowrap px-8">
        {items.map((item, index) => (
          <TapeEntry key={`${item.label}-${index}`} item={item} />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent" />
    </div>
  )
}
