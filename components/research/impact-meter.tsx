import type { CatalystEventView } from "@/types/research-ui"
import { cn } from "@/lib/utils"

export type ImpactLevel = NonNullable<CatalystEventView["expectedImpact"]>

const BAR_COUNT = 3

function barFillClass(level: ImpactLevel, barIndex: number): string {
  if (level === "high") {
    return "bg-primary"
  }
  if (level === "medium") {
    return barIndex < 2 ? "bg-foreground/50" : "bg-foreground/15"
  }
  return barIndex === 0 ? "bg-foreground/25" : "bg-foreground/10"
}

export function impactLabelClass(level: ImpactLevel): string {
  if (level === "high") {
    return "text-primary"
  }
  if (level === "medium") {
    return "text-foreground/80"
  }
  return "text-muted-foreground"
}

export function ImpactBars({
  impact,
  className,
}: {
  impact: ImpactLevel
  className?: string
}) {
  return (
    <span
      className={cn("flex items-end gap-0.5", className)}
      aria-hidden
    >
      {Array.from({ length: BAR_COUNT }, (_, barIndex) => (
        <span
          key={barIndex}
          className={cn("h-3 w-1 rounded-sm", barFillClass(impact, barIndex))}
        />
      ))}
    </span>
  )
}

export function ImpactMeter({
  impact,
}: {
  impact: CatalystEventView["expectedImpact"] | undefined
}) {
  if (!impact) {
    return <span className="text-muted-foreground">—</span>
  }

  const label = impact.charAt(0).toUpperCase() + impact.slice(1)

  return (
    <span className="inline-flex items-center gap-2">
      <ImpactBars impact={impact} />
      <span className={cn("font-mono text-xs", impactLabelClass(impact))}>
        {label}
      </span>
    </span>
  )
}
