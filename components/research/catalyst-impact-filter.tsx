"use client"

import { ImpactBars, impactLabelClass } from "@/components/research/impact-meter"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatExpectedImpact } from "@/lib/expected-impact-display"
import {
  ALL_EXPECTED_IMPACTS,
  type ExpectedImpact,
} from "@/lib/research-results-utils"
import { cn } from "@/lib/utils"

const IMPACT_OPTIONS: {
  value: ExpectedImpact
  label: string
  onTextClassName: string
}[] = [
  {
    value: "high",
    label: "High",
    onTextClassName: "data-[state=on]:text-primary",
  },
  {
    value: "medium",
    label: "Medium",
    onTextClassName: "data-[state=on]:text-foreground",
  },
  {
    value: "low",
    label: "Low",
    onTextClassName: "data-[state=on]:text-muted-foreground",
  },
]

const TOGGLE_ITEM_CLASSNAME = cn(
  "rounded-md",
  "data-[state=on]:bg-primary/15 data-[state=on]:border-primary/50",
  "data-[state=off]:border-border/40 data-[state=off]:opacity-50",
)

export type CatalystImpactFilterProps = {
  selected: ReadonlySet<ExpectedImpact>
  onSelectedChange: (selected: Set<ExpectedImpact>) => void
  filteredCount: number
  totalCount: number
  variant?: "default" | "results"
}

function ImpactToggleContent({
  value,
  label,
  variant,
}: {
  value: ExpectedImpact
  label: string
  variant: "default" | "results"
}) {
  if (variant === "results") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <ImpactBars impact={value} />
        <span className={cn("font-mono text-xs", impactLabelClass(value))}>
          {label}
        </span>
      </span>
    )
  }

  const presentation = formatExpectedImpact(value)
  const Icon = presentation.Icon

  return (
    <span className="inline-flex items-center gap-1.5">
      {Icon ? <Icon aria-hidden className="size-3.5 shrink-0" /> : null}
      {label}
    </span>
  )
}

export function CatalystImpactFilter({
  selected,
  onSelectedChange,
  filteredCount,
  totalCount,
  variant = "default",
}: CatalystImpactFilterProps) {
  const isResults = variant === "results"
  const isFiltered = selected.size < ALL_EXPECTED_IMPACTS.length

  function handleValueChange(values: string[]) {
    if (values.length === 0) {
      return
    }
    onSelectedChange(new Set(values as ExpectedImpact[]))
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            isResults
              ? "font-mono text-[10px] tracking-widest text-muted-foreground/70 uppercase"
              : "text-xs font-semibold tracking-wider text-muted-foreground uppercase",
          )}
        >
          Expected impact
        </span>
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          value={Array.from(selected)}
          onValueChange={handleValueChange}
          aria-label="Filter by expected impact"
          className="rounded-md"
        >
          {IMPACT_OPTIONS.map(({ value, label, onTextClassName }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={label}
              className={cn(TOGGLE_ITEM_CLASSNAME, onTextClassName)}
            >
              <ImpactToggleContent
                value={value}
                label={label}
                variant={variant}
              />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {isFiltered ? (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {filteredCount} of {totalCount} events
        </p>
      ) : null}
    </div>
  )
}
