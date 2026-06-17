import { cn } from "@/lib/utils"

type TapeItem = {
  symbol: string
  price: number
  changePct: number
}

// Static placeholder data — an ambient, decorative market tape (not live quotes).
const TAPE: readonly TapeItem[] = [
  { symbol: "S&P 500", price: 6032.38, changePct: 0.41 },
  { symbol: "NASDAQ", price: 19764.85, changePct: 0.73 },
  { symbol: "DOW", price: 44642.52, changePct: -0.28 },
  { symbol: "VIX", price: 13.91, changePct: -1.84 },
  { symbol: "BTC", price: 97342.1, changePct: 2.12 },
  { symbol: "ETH", price: 3401.77, changePct: 1.34 },
  { symbol: "GOLD", price: 2648.3, changePct: 0.36 },
  { symbol: "WTI", price: 68.42, changePct: -0.95 },
  { symbol: "10Y", price: 4.41, changePct: 0.18 },
  { symbol: "DXY", price: 106.74, changePct: -0.22 },
] as const

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

function TapeEntry({ item }: { item: TapeItem }) {
  const positive = item.changePct >= 0
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className="text-muted-foreground/80">{item.symbol}</span>
      <span className="text-foreground/90">{formatPrice(item.price)}</span>
      <span className={cn(positive ? "text-up" : "text-down")}>
        {formatChange(item.changePct)}
      </span>
    </div>
  )
}

export function TickerTape() {
  // Duplicate the tape so the -50% scroll loops seamlessly.
  const items = [...TAPE, ...TAPE]

  return (
    <div className="relative shrink-0 overflow-hidden border-t border-border bg-background/80 py-2">
      <div className="flex w-max animate-ticker gap-8 whitespace-nowrap px-8">
        {items.map((item, index) => (
          <TapeEntry key={`${item.symbol}-${index}`} item={item} />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent" />
    </div>
  )
}
