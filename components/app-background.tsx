"use client"

import { MarketHeatBackdrop } from "@/components/market-heat-backdrop"
import { cn } from "@/lib/utils"

/** Site-wide ambient WebGL fog driven by live market heat. */
export function AppBackground({ className }: { className?: string }) {
  return <MarketHeatBackdrop className={cn(className)} />
}
