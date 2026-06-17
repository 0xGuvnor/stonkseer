"use client"

import Link from "next/link"
import { Loader2, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Id } from "@/convex/_generated/dataModel"
import { formatIssuerHeading } from "@/lib/ticker-display"
import { formatRelativeDate } from "@/lib/portfolio-selection"
import { eventTimingLabel } from "@/lib/research-results-utils"
import type { PortfolioHoldingView } from "@/types/research-ui"

export type PortfolioHoldingsTableProps = {
  holdings: PortfolioHoldingView[]
  now: number
  onRemoveStock: (portfolioStockId: Id<"portfolioStocks">) => Promise<void>
}

export function PortfolioHoldingsTable({
  holdings,
  now,
  onRemoveStock,
}: PortfolioHoldingsTableProps) {
  const [removingId, setRemovingId] = useState<Id<"portfolioStocks"> | null>(
    null,
  )

  async function handleRemove(portfolioStockId: Id<"portfolioStocks">) {
    setRemovingId(portfolioStockId)
    try {
      await onRemoveStock(portfolioStockId)
      toast.success("Ticker removed from portfolio")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove ticker.",
      )
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="glass overflow-hidden rounded-2xl ring-1 ring-border/60">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow className="border-border/60 bg-muted/40 hover:bg-muted/40">
            <TableHead className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Ticker
            </TableHead>
            <TableHead className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Company
            </TableHead>
            <TableHead className="w-24 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Catalysts
            </TableHead>
            <TableHead className="min-w-48 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Next up
            </TableHead>
            <TableHead className="w-28 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Added
            </TableHead>
            <TableHead className="w-16 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {holdings.map((holding) => (
            <TableRow
              key={holding.portfolioStockId}
              className="border-border/40 transition-colors hover:bg-primary/[0.04]"
            >
              <TableCell className="align-top font-medium whitespace-normal">
                <Link
                  href={`/${holding.symbol}`}
                  className="font-mono text-primary hover:underline"
                >
                  {holding.symbol}
                </Link>
              </TableCell>
              <TableCell className="align-top whitespace-normal text-muted-foreground">
                {formatIssuerHeading(holding.symbol, holding.companyName)}
              </TableCell>
              <TableCell className="align-top whitespace-normal">
                {holding.catalystCount}
              </TableCell>
              <TableCell className="max-w-xs align-top whitespace-normal">
                {holding.nextEvent ? (
                  <div className="space-y-0.5">
                    <p className="text-sm text-muted-foreground">
                      {eventTimingLabel(holding.nextEvent, now)}
                    </p>
                    <p className="text-sm font-medium">{holding.nextEvent.title}</p>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="align-top text-sm whitespace-normal text-muted-foreground">
                {formatRelativeDate(holding.addedAt, now)}
              </TableCell>
              <TableCell className="align-top">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={removingId === holding.portfolioStockId}
                      aria-label={`Remove ${holding.symbol} from portfolio`}
                    >
                      {removingId === holding.portfolioStockId ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Remove {holding.symbol}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes {holding.symbol} and all{" "}
                        {holding.catalystCount} tracked catalyst
                        {holding.catalystCount === 1 ? "" : "s"} from this
                        portfolio.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleRemove(holding.portfolioStockId)}
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
