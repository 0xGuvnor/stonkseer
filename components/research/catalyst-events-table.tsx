"use client"

import Link from "next/link"
import { useState } from "react"
import {
  ExternalLink,
  SignalHigh,
  SignalLow,
  SignalMedium,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ImpactMeter } from "@/components/research/impact-meter"
import {
  eventTimingLabel,
  formatQuarterLabel,
  parseSortAnchor,
  quarterKeyFromDate,
  sortCatalystEventsByAnchor,
} from "@/lib/research-results-utils"
import { formatSourceLinkLabel } from "@/lib/source-link-label"
import { cn } from "@/lib/utils"
import type { CatalystEventView } from "@/types/research-ui"

export type CatalystEventsTableProps = {
  events: CatalystEventView[]
  showSymbolColumn?: boolean
  getSymbol?: (event: CatalystEventView) => string | undefined
  className?: string
  now?: number
  variant?: "default" | "results"
}

type ExpectedImpactPresentation = {
  label: string
  className: string
  Icon?: LucideIcon
}

function formatExpectedImpact(
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

const ONGOING_SUFFIX = " (ongoing)"

function splitTimingLabel(label: string): {
  primary: string
  showOngoingBadge: boolean
} {
  if (label.endsWith(ONGOING_SUFFIX)) {
    return {
      primary: label.slice(0, -ONGOING_SUFFIX.length),
      showOngoingBadge: true,
    }
  }
  return { primary: label, showOngoingBadge: false }
}

function TimingCell({
  event,
  now,
  variant,
}: {
  event: CatalystEventView
  now: number
  variant: "default" | "results"
}) {
  const label = eventTimingLabel(event, now)

  if (variant === "default") {
    return (
      <TableCell className="max-w-44 align-top whitespace-normal text-muted-foreground">
        {label}
      </TableCell>
    )
  }

  const { primary, showOngoingBadge } = splitTimingLabel(label)

  return (
    <TableCell className="max-w-44 align-top whitespace-normal text-muted-foreground">
      <div className="flex flex-col items-start gap-1.5">
        <span>{primary}</span>
        {showOngoingBadge ? (
          <span className="rounded border border-border/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">
            ongoing
          </span>
        ) : null}
      </div>
    </TableCell>
  )
}

function SignificanceCell({
  event,
  variant,
}: {
  event: CatalystEventView
  variant: "default" | "results"
}) {
  const hasSummary = event.summary.trim().length > 0
  const hasWhyItMatters = event.whyItMatters.trim().length > 0

  if (!hasSummary && !hasWhyItMatters) {
    return (
      <TableCell className="max-w-xl min-w-48 align-top whitespace-normal">
        <span className="text-muted-foreground">—</span>
      </TableCell>
    )
  }

  if (variant === "default") {
    return (
      <TableCell className="max-w-xl min-w-48 align-top whitespace-normal">
        {hasSummary ? (
          <p className="mb-1.5 text-sm leading-snug">{event.summary}</p>
        ) : null}
        {hasWhyItMatters ? (
          <p className="text-sm leading-snug text-muted-foreground">
            {event.whyItMatters}
          </p>
        ) : null}
      </TableCell>
    )
  }

  return (
    <TableCell className="max-w-xl min-w-48 align-top whitespace-normal">
      {hasSummary ? (
        <p className="text-sm leading-snug text-foreground">{event.summary}</p>
      ) : null}
      {hasWhyItMatters ? (
        <p className="mt-2 border-l-2 border-primary/60 pl-3 text-sm leading-snug text-muted-foreground">
          {event.whyItMatters}
        </p>
      ) : null}
    </TableCell>
  )
}

function SourcesCell({
  event,
  variant,
}: {
  event: CatalystEventView
  variant: "default" | "results"
}) {
  if (event.sources.length === 0) {
    return (
      <TableCell
        className={cn(
          "overflow-hidden align-top whitespace-normal",
          variant === "results"
            ? "min-w-24"
            : "w-20 max-w-20 min-w-20",
        )}
      >
        <span className="text-muted-foreground">—</span>
      </TableCell>
    )
  }

  if (variant === "default") {
    return (
      <TableCell className="w-20 max-w-20 min-w-20 overflow-hidden align-top whitespace-normal">
        <div className="flex w-full min-w-0 flex-col items-start gap-1">
          {event.sources.map((source) => (
            <Button
              key={source._id}
              variant="link"
              size="sm"
              className="h-auto min-h-0 max-w-full justify-start p-0 font-normal"
              asChild
            >
              <a
                href={source.url}
                rel="noreferrer"
                target="_blank"
                title={`${source.publisher}: ${source.title}`}
              >
                <span className="block max-w-full min-w-0 truncate text-left">
                  {source.publisher}
                </span>
              </a>
            </Button>
          ))}
        </div>
      </TableCell>
    )
  }

  return (
    <TableCell className="min-w-24 overflow-hidden align-top whitespace-normal">
      <div className="flex w-full min-w-0 flex-col items-start gap-1">
        {event.sources.map((source) => (
          <a
            key={source._id}
            href={source.url}
            rel="noreferrer"
            target="_blank"
            title={`${source.publisher}: ${source.title}`}
            className="group inline-flex max-w-full min-w-0 items-center gap-1 font-mono text-xs text-primary hover:text-primary/80"
          >
            <span className="truncate">
              {formatSourceLinkLabel(source.url)}
            </span>
            <ExternalLink
              aria-hidden
              className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            />
          </a>
        ))}
      </div>
    </TableCell>
  )
}

export function CatalystEventsTable({
  events,
  showSymbolColumn = false,
  getSymbol,
  className,
  now: nowProp,
  variant = "default",
}: CatalystEventsTableProps) {
  const [resolvedNow] = useState(() => nowProp ?? Date.now())
  const now = nowProp ?? resolvedNow
  const sortedEvents =
    events.length > 0 ? sortCatalystEventsByAnchor(events, now) : []
  const isResults = variant === "results"

  const headerClassName = isResults
    ? "font-mono text-[10px] tracking-widest text-muted-foreground/70 uppercase"
    : "text-xs font-semibold tracking-wider text-muted-foreground uppercase"

  return (
    <div
      className={
        className ??
        (isResults
          ? "overflow-hidden rounded-xl border border-border/40 bg-card/30"
          : "glass overflow-hidden rounded-2xl ring-1 ring-border/60")
      }
    >
      <Table className={showSymbolColumn ? "min-w-[980px]" : "min-w-[920px]"}>
        <TableHeader>
          <TableRow
            className={
              isResults
                ? "border-border/40 border-b bg-transparent hover:bg-transparent"
                : "border-border/60 bg-muted/40 hover:bg-muted/40"
            }
          >
            {showSymbolColumn ? (
              <TableHead className={cn("w-16 min-w-16", headerClassName)}>
                Ticker
              </TableHead>
            ) : null}
            <TableHead className={cn("w-22 min-w-22", headerClassName)}>
              Quarter
            </TableHead>
            <TableHead className={cn("max-w-44", headerClassName)}>
              {isResults ? "Timing" : "Expected timing"}
            </TableHead>
            <TableHead className={cn("max-w-56", headerClassName)}>
              Event / milestone
            </TableHead>
            <TableHead className={cn("max-w-xl min-w-48", headerClassName)}>
              Strategic significance
            </TableHead>
            <TableHead className={cn("w-24 min-w-24", headerClassName)}>
              {isResults ? "Impact" : "Expected impact"}
            </TableHead>
            <TableHead
              className={cn(
                isResults ? "min-w-24" : "w-20 max-w-20 min-w-20",
                headerClassName,
              )}
            >
              Sources
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedEvents.map((event, index) => {
            const anchor = parseSortAnchor(event, now)
            const prevEvent = index > 0 ? sortedEvents[index - 1] : undefined
            const prevAnchor = prevEvent ? parseSortAnchor(prevEvent, now) : null
            const qKey = anchor ? quarterKeyFromDate(anchor) : "\0unknown"
            const prevQKey = prevAnchor
              ? quarterKeyFromDate(prevAnchor)
              : "\0unknown"
            const showQuarterLabel = qKey !== prevQKey
            const quarterLabel =
              showQuarterLabel && anchor
                ? formatQuarterLabel(anchor)
                : showQuarterLabel
                  ? "—"
                  : ""
            const symbol = getSymbol?.(event)
            const expectedImpact = formatExpectedImpact(event.expectedImpact)
            const ImpactIcon = expectedImpact.Icon

            return (
              <TableRow
                key={event._id}
                className={
                  isResults
                    ? "border-border/40 border-b transition-colors hover:bg-foreground/[0.03]"
                    : "border-border/40 transition-colors hover:bg-primary/[0.04]"
                }
              >
                {showSymbolColumn ? (
                  <TableCell className="align-top font-medium whitespace-normal">
                    {symbol ? (
                      <Link
                        href={`/${symbol}`}
                        className="text-primary hover:underline"
                      >
                        {symbol}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                ) : null}
                <TableCell className="align-top text-sm font-medium whitespace-normal text-muted-foreground">
                  {quarterLabel}
                </TableCell>
                <TimingCell event={event} now={now} variant={variant} />
                <TableCell className="max-w-56 align-top font-medium whitespace-normal">
                  {event.title}
                </TableCell>
                <SignificanceCell event={event} variant={variant} />
                <TableCell
                  className={cn(
                    "w-24 min-w-24 align-top text-sm whitespace-normal",
                    !isResults && expectedImpact.className,
                  )}
                >
                  {isResults ? (
                    <ImpactMeter impact={event.expectedImpact} />
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      {ImpactIcon ? (
                        <ImpactIcon aria-hidden className="size-3.5 shrink-0" />
                      ) : null}
                      {expectedImpact.label}
                    </span>
                  )}
                </TableCell>
                <SourcesCell event={event} variant={variant} />
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
