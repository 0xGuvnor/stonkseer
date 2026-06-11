"use client"

import { Show, useAuth } from "@clerk/nextjs"
import {
  useConvexAuth,
  useMutation,
  useQuery,
} from "convex/react"
import Link from "next/link"
import { useState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { RESEARCH_ROUTE_CENTER_SHELL } from "@/lib/research-route-layout"
import {
  eventTimingLabel,
  formatQuarterLabel,
  parseAnchorDate,
  quarterKeyFromDate,
  sortCatalystEventsByAnchor,
} from "@/lib/research-results-utils"
import type { PortfolioView } from "@/types/research-ui"

const NEW_PORTFOLIO_VALUE = "__new__"

export type ResearchRunResultsProps = {
  tickerSymbol: string
  runId: Id<"researchRuns">
  anonymousTokenHash?: string
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <Loader2
        className="size-12 animate-spin text-primary"
        aria-hidden
      />
      <div className="space-y-2 text-center">
        <p className="font-medium">{label}</p>
        <p className="max-w-md text-sm text-muted-foreground">
          This usually takes a moment while we gather catalysts from market and
          web sources.
        </p>
      </div>
    </div>
  )
}

export function ResearchRunResults({
  tickerSymbol,
  runId,
  anonymousTokenHash,
}: ResearchRunResultsProps) {
  const [portfolioName, setPortfolioName] = useState("My Portfolio")
  const [portfolioSelection, setPortfolioSelection] = useState<string>("")
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const { isLoaded: clerkLoaded, isSignedIn } = useAuth()
  const { isAuthenticated } = useConvexAuth()
  const createPortfolio = useMutation(api.portfolios.create)
  const saveResearchToPortfolio = useMutation(
    api.portfolios.saveResearchToPortfolio
  )

  const me = useQuery(api.users.current, isAuthenticated ? {} : "skip")

  const portfolios = useQuery(
    api.portfolios.listMine,
    isAuthenticated && me ? {} : "skip"
  )

  const hasAuthenticatedRunAccess =
    isSignedIn && isAuthenticated && me !== undefined && me !== null
  const shouldLoadResults =
    anonymousTokenHash !== undefined || hasAuthenticatedRunAccess

  const results = useQuery(
    api.research.getRunResults,
    shouldLoadResults ? { runId, anonymousTokenHash } : "skip"
  )

  const events = results?.events
  const sortedCatalystEvents =
    events && events.length > 0 ? sortCatalystEventsByAnchor(events) : []

  const portfolioList = portfolios ?? []
  const saveTargetValue =
    portfolioSelection || portfolioList[0]?._id || NEW_PORTFOLIO_VALUE

  const querying = results === undefined
  const runningOrQueued =
    results !== undefined &&
    results !== null &&
    (results.run.status === "queued" || results.run.status === "running")

  async function handleSave() {
    if (!isAuthenticated || !me) {
      setSaveMessage(
        clerkLoaded && isSignedIn
          ? "Connecting your account—try again in a moment."
          : "Sign in with Google to save this ticker to a portfolio."
      )
      return
    }

    if (!results || results.events.length === 0) {
      setSaveMessage("No catalyst events to save for this run.")
      return
    }

    const eventIds = sortedCatalystEvents.map((event) => event._id)

    setSaveMessage(null)
    const selectedPortfolioValue =
      portfolioSelection || portfolios?.[0]?._id || NEW_PORTFOLIO_VALUE
    const portfolioId =
      selectedPortfolioValue !== NEW_PORTFOLIO_VALUE
        ? (selectedPortfolioValue as Id<"portfolios">)
        : await createPortfolio({
            name: portfolioName,
          })

    await saveResearchToPortfolio({
      portfolioId,
      symbol: results.run.symbol,
      eventIds,
    })
    setSaveMessage(
      `Saved ${results.run.symbol} (${eventIds.length} catalyst${eventIds.length === 1 ? "" : "s"}) to your portfolio.`
    )
  }

  if (!shouldLoadResults) {
    return (
      <section className={RESEARCH_ROUTE_CENTER_SHELL}>
        <div className="w-full max-w-xl text-left">
          <Alert>
            <AlertDescription>
              {clerkLoaded && isSignedIn
                ? "Connecting your account—try again in a moment."
                : "This page could not attach to your research session. Start research from home."}
            </AlertDescription>
          </Alert>
        </div>
      </section>
    )
  }

  if (results === null) {
    return (
      <section className={RESEARCH_ROUTE_CENTER_SHELL}>
        <div className="flex w-full max-w-xl flex-col items-stretch gap-4 text-left">
          <Alert variant="destructive">
            <AlertDescription>
              This research run could not be loaded or you no longer have access
              to it. Try running research again from the home page.
            </AlertDescription>
          </Alert>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/">Back to search</Link>
          </Button>
        </div>
      </section>
    )
  }

  if (querying || runningOrQueued) {
    return (
      <section className={RESEARCH_ROUTE_CENTER_SHELL}>
        <Card className="w-full shadow-sm">
          <CardHeader className="items-center space-y-1 text-center sm:items-center">
            <CardTitle className="text-xl font-semibold">
              {tickerSymbol} catalyst research
            </CardTitle>
            <CardDescription>
              {runningOrQueued
                ? `Status: ${results.run.status}`
                : "Loading…"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoadingState
              label={
                runningOrQueued
                  ? `Research in progress (${results!.run.status})`
                  : "Loading results"
              }
            />
          </CardContent>
        </Card>
      </section>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <Card className="shadow-sm">
        <CardHeader>
          <div>
            <CardTitle className="text-xl font-semibold">
              {results.run.symbol} catalyst research
            </CardTitle>
            <CardDescription>
              Status: {results.run.status}
              {results.run.cacheHit ? " (cached)" : ""}
            </CardDescription>
          </div>
          {results.run.status === "completed" && results.events.length > 0 ? (
            <CardAction>
              <Button onClick={handleSave}>Save to portfolio</Button>
            </CardAction>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-4">
          {saveMessage ? (
            <Alert>
              <AlertDescription>{saveMessage}</AlertDescription>
            </Alert>
          ) : null}

          {results.run.status === "completed" && results.events.length > 0 ? (
            <Show when="signed-out">
              <Alert>
                <AlertDescription>
                  Sign in with Google to save these catalysts to a portfolio.
                </AlertDescription>
              </Alert>
            </Show>
          ) : null}

          {results.run.status === "completed" &&
          results.events.length > 0 ? (
            <Show when="signed-in">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="portfolio-default-name-results">
                    Default portfolio name
                  </Label>
                  <Input
                    id="portfolio-default-name-results"
                    value={portfolioName}
                    onChange={(event) => setPortfolioName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="portfolio-save-target-results">
                    Save target
                  </Label>
                  <Select
                    value={saveTargetValue}
                    onValueChange={setPortfolioSelection}
                  >
                    <SelectTrigger
                      id="portfolio-save-target-results"
                      className="w-full min-w-0"
                    >
                      <SelectValue placeholder="Choose a portfolio" />
                    </SelectTrigger>
                    <SelectContent>
                      {portfolioList.map((portfolio: PortfolioView) => (
                        <SelectItem key={portfolio._id} value={portfolio._id}>
                          {portfolio.name}
                        </SelectItem>
                      ))}
                      <SelectItem value={NEW_PORTFOLIO_VALUE}>
                        Create {portfolioName}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium leading-snug">
                    Your portfolios
                  </p>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {portfolioList.length > 0 ? (
                      portfolioList.map((portfolio: PortfolioView) => (
                        <p key={portfolio._id}>{portfolio.name}</p>
                      ))
                    ) : (
                      <p>
                        No portfolios yet. Saving a completed run creates one
                        with every catalyst from that run.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </Show>
          ) : null}

          {results.run.error ? (
            <Alert variant="destructive">
              <AlertDescription>{results.run.error}</AlertDescription>
            </Alert>
          ) : null}

          {results.events.length > 0 ? (
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-22 min-w-22 text-xs tracking-wide text-muted-foreground uppercase">
                    Quarter
                  </TableHead>
                  <TableHead className="max-w-44 text-xs tracking-wide text-muted-foreground uppercase">
                    Expected timing
                  </TableHead>
                  <TableHead className="max-w-56 text-xs tracking-wide text-muted-foreground uppercase">
                    Event / milestone
                  </TableHead>
                  <TableHead className="max-w-xl min-w-48 text-xs tracking-wide text-muted-foreground uppercase">
                    Strategic significance
                  </TableHead>
                  <TableHead className="w-20 max-w-20 min-w-20 text-xs tracking-wide text-muted-foreground uppercase">
                    Sources
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCatalystEvents.map((event, index) => {
                  const anchor = parseAnchorDate(event)
                  const prevEvent =
                    index > 0 ? sortedCatalystEvents[index - 1] : undefined
                  const prevAnchor = prevEvent
                    ? parseAnchorDate(prevEvent)
                    : null
                  const qKey = anchor
                    ? quarterKeyFromDate(anchor)
                    : "\0unknown"
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

                  return (
                    <TableRow key={event._id}>
                      <TableCell className="align-top whitespace-normal text-muted-foreground">
                        {quarterLabel}
                      </TableCell>
                      <TableCell className="max-w-44 align-top whitespace-normal text-muted-foreground">
                        {eventTimingLabel(event)}
                      </TableCell>
                      <TableCell className="max-w-56 align-top font-medium whitespace-normal">
                        {event.title}
                      </TableCell>
                      <TableCell className="max-w-xl min-w-48 align-top whitespace-normal">
                        {event.summary.trim() ? (
                          <p className="mb-1.5 text-sm leading-snug text-muted-foreground">
                            {event.summary}
                          </p>
                        ) : null}
                        {event.whyItMatters.trim() ? (
                          <p className="text-sm leading-snug">
                            {event.whyItMatters}
                          </p>
                        ) : event.summary.trim() ? null : (
                          <span className="text-muted-foreground">—</span>
                        )}
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
          ) : results.run.status === "completed" && !results.run.error ? (
            <p className="text-sm text-muted-foreground">
              No catalyst events were extracted for this run.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
