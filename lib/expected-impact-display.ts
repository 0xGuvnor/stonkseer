import {
  SignalHigh,
  SignalLow,
  SignalMedium,
  type LucideIcon,
} from "lucide-react"

import type { CatalystEventView } from "@/types/research-ui"

export type ExpectedImpactPresentation = {
  label: string
  className: string
  Icon?: LucideIcon
}

export function formatExpectedImpact(
  impact: CatalystEventView["expectedImpact"] | undefined,
): ExpectedImpactPresentation {
  if (!impact) {
    return { label: "—", className: "text-muted-foreground" }
  }

  const label = impact.charAt(0).toUpperCase() + impact.slice(1)

  if (impact === "low") {
    return { label, className: "text-muted-foreground", Icon: SignalLow }
  }

  if (impact === "high") {
    return { label, className: "font-medium text-primary", Icon: SignalHigh }
  }

  return { label, className: "", Icon: SignalMedium }
}
