"use client"

import {
  SignalHigh,
  SignalLow,
  SignalMedium,
  type LucideIcon,
} from "lucide-react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  ALL_EXPECTED_IMPACTS,
  type ExpectedImpact,
} from "@/lib/research-results-utils"
import { cn } from "@/lib/utils"

const IMPACT_OPTIONS: {
  value: ExpectedImpact
  label: string
  Icon: LucideIcon
  activeClassName: string
}[] = [
  {
    value: "high",
    label: "High",
    Icon: SignalHigh,
    activeClassName: "data-[state=on]:text-primary",
  },
  {
    value: "medium",
    label: "Medium",
    Icon: SignalMedium,
    activeClassName: "data-[state=on]:text-foreground",
  },
  {
    value: "low",
    label: "Low",
    Icon: SignalLow,
    activeClassName: "data-[state=on]:text-muted-foreground",
  },
]

export type CatalystImpactFilterProps = {
  selected: ReadonlySet<ExpectedImpact>
  onSelectedChange: (selected: Set<ExpectedImpact>) => void
  filteredCount: number
  totalCount: number
  variant?: "default" | "results"
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
          {isResults ? "Impact filter" : "Expected impact"}
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
          {IMPACT_OPTIONS.map(({ value, label, Icon, activeClassName }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={label}
              className={cn("rounded-md", activeClassName)}
            >
              <Icon aria-hidden className="size-3.5" />
              {label}
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
