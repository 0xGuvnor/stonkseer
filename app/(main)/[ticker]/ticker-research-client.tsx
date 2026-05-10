"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { ResearchRunResults } from "@/components/research/research-run-results"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { Id } from "@/convex/_generated/dataModel"
import { RESEARCH_ROUTE_CENTER_SHELL } from "@/lib/research-route-layout"
import { readActiveResearchSession } from "@/lib/research-run-session-storage"

type HydratedRun =
  | { kind: "ready"; runId: Id<"researchRuns">; anonymousTokenHash?: string }
  | { kind: "empty" }

export function TickerResearchClient({ ticker }: { ticker: string }) {
  const [hydrated, setHydrated] = useState(false)
  const [run, setRun] = useState<HydratedRun | null>(null)

  useEffect(() => {
    queueMicrotask(() => {
      const payload = readActiveResearchSession(ticker)
      if (payload?.runId) {
        setRun({
          kind: "ready",
          runId: payload.runId,
          anonymousTokenHash: payload.anonymousTokenHash,
        })
      } else {
        setRun({ kind: "empty" })
      }
      setHydrated(true)
    })
  }, [ticker])

  if (!hydrated || run === null) {
    return (
      <section className={RESEARCH_ROUTE_CENTER_SHELL}>
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">Opening research…</p>
        </div>
      </section>
    )
  }

  if (run.kind === "empty") {
    return (
      <section className={RESEARCH_ROUTE_CENTER_SHELL}>
        <div className="flex w-full max-w-xl flex-col items-stretch gap-6 text-left">
          <Alert>
            <AlertDescription>
              Start a ticker search from home to load catalyst results here for{" "}
              <span className="font-medium">{ticker}</span>.
            </AlertDescription>
          </Alert>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/">Back to search</Link>
          </Button>
        </div>
      </section>
    )
  }

  return (
    <ResearchRunResults
      tickerSymbol={ticker}
      runId={run.runId}
      anonymousTokenHash={run.anonymousTokenHash}
    />
  )
}
