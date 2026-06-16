"use client"

import Link from "next/link"
import {
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
import {
  eventTimingLabel,
  formatQuarterLabel,
  parseSortAnchor,
  quarterKeyFromDate,
  sortCatalystEventsByAnchor,
} from "@/lib/research-results-utils"
import type { CatalystEventView } from "@/types/research-ui"

export type CatalystEventsTableProps = {
  events: CatalystEventView[]
  showSymbolColumn?: boolean
  getSymbol?: (event: CatalystEventView) => string | undefined
  className?: string
  now?: number
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

export function CatalystEventsTable({
  events,
  showSymbolColumn = false,
  getSymbol,
  className,
  now = Date.now(),
}: CatalystEventsTableProps) {
  const sortedEvents =
    events.length > 0 ? sortCatalystEventsByAnchor(events, now) : []

  return (
    <div
      className={
        className ??
        "glass overflow-hidden rounded-2xl ring-1 ring-border/60"
      }
    >
      <Table className={showSymbolColumn ? "min-w-[980px]" : "min-w-[920px]"}>
        <TableHeader>
          <TableRow className="border-border/60 bg-muted/40 hover:bg-muted/40">
            {showSymbolColumn ? (
              <TableHead className="w-16 min-w-16 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Ticker
              </TableHead>
            ) : null}
            <TableHead className="w-22 min-w-22 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Quarter
            </TableHead>
            <TableHead className="max-w-44 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Expected timing
            </TableHead>
            <TableHead className="max-w-56 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Event / milestone
            </TableHead>
            <TableHead className="max-w-xl min-w-48 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Strategic significance
            </TableHead>
            <TableHead className="w-24 min-w-24 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Expected impact
            </TableHead>
            <TableHead className="w-20 max-w-20 min-w-20 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
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
                className="border-border/40 transition-colors hover:bg-primary/[0.04]"
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
                <TableCell className="max-w-44 align-top whitespace-normal text-muted-foreground">
                  {eventTimingLabel(event, now)}
                </TableCell>
                <TableCell className="max-w-56 align-top font-medium whitespace-normal">
                  {event.title}
                </TableCell>
                <TableCell className="max-w-xl min-w-48 align-top whitespace-normal">
                  {event.summary.trim() ? (
                    <p className="mb-1.5 text-sm leading-snug">
                      {event.summary}
                    </p>
                  ) : null}
                  {event.whyItMatters.trim() ? (
                    <p className="text-sm leading-snug text-muted-foreground">
                      {event.whyItMatters}
                    </p>
                  ) : event.summary.trim() ? null : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell
                  className={`w-24 min-w-24 align-top text-sm whitespace-normal ${expectedImpact.className}`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {ImpactIcon ? (
                      <ImpactIcon aria-hidden className="size-3.5 shrink-0" />
                    ) : null}
                    {expectedImpact.label}
                  </span>
                </TableCell>
                <TableCell className="w-20 max-w-20 min-w-20 overflow-hidden align-top whitespace-normal">
                  {event.sources.length > 0 ? (
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
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
