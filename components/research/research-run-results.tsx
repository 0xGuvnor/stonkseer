"use client"

import { Show, useAuth } from "@clerk/nextjs"
import {
  useConvexAuth,
  useMutation,
  useQuery,
} from "convex/react"
import Link from "next/link"
import { useState } from "react"
import { Briefcase, Loader2, RefreshCw, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { showConvexMutationErrorToast } from "@/lib/convex-mutation-error"
import { isAdminUser } from "@/lib/admin"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import { RESEARCH_ROUTE_CENTER_SHELL } from "@/lib/research-route-layout"
import { sortCatalystEventsByAnchor } from "@/lib/research-results-utils"
import { CatalystEventsTable } from "@/components/research/catalyst-events-table"
import { ResearchNotifyToggle } from "@/components/research/research-notify-toggle"
import type { PortfolioView } from "@/types/research-ui"

const NEW_PORTFOLIO_VALUE = "__new__"

const RESULTS_SHELL = "mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8"

export type ResearchRunResultsProps = {
  tickerSymbol: string
  runId: Id<"researchRuns">
  anonymousTokenHash?: string
}

function StatusBadge({
  status,
  cacheHit,
}: {
  status: string
  cacheHit?: boolean
}) {
  const isLive = status === "queued" || status === "running"
  const isDone = status === "completed"
  const isError = status === "failed" || status === "error"

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge
        variant={isError ? "destructive" : isDone ? "default" : "secondary"}
        className={cn("capitalize", isDone && "bg-gradient-brand border-0")}
      >
        {isLive ? (
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-70" />
            <span className="relative inline-flex size-1.5 rounded-full bg-current" />
          </span>
        ) : null}
        {status}
      </Badge>
      {cacheHit ? (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          Cached
        </Badge>
      ) : null}
    </span>
  )
}

function ResearchRunHeading({
  symbol,
  companyName,
  suffix,
}: {
  symbol: string
  companyName?: string
  suffix: string
}) {
  return (
    <>
      {companyName ? (
        <>
          {companyName} (<span className="font-mono">{symbol}</span>)
        </>
      ) : (
        <span className="font-mono">{symbol}</span>
      )}{" "}
      <span className="text-muted-foreground">{suffix}</span>
    </>
  )
}

function ResultsSkeleton({
  symbol,
  companyName,
  runId,
  anonymousTokenHash,
}: {
  symbol: string
  companyName?: string
  runId: Id<"researchRuns">
  anonymousTokenHash?: string
}) {
  return (
    <div className={RESULTS_SHELL}>
      <div className="glass rounded-2xl p-5 ring-1 ring-border/60 sm:p-6">
        <div className="flex items-center gap-3">
          <Sparkles className="size-5 shrink-0 text-primary" aria-hidden />
          <div className="space-y-2">
            <p className="text-lg font-semibold tracking-tight">
              <ResearchRunHeading
                symbol={symbol}
                companyName={companyName}
                suffix="catalyst research"
              />
            </p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Gathering catalysts from market and web sources…
            </div>
          </div>
        </div>

        <ResearchNotifyToggle
          runId={runId}
          symbol={symbol}
          anonymousTokenHash={anonymousTokenHash}
        />

        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl border border-border/40 p-3"
            >
              <Skeleton className="h-4 w-14 shrink-0" />
              <Skeleton className="h-4 w-24 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-4 w-40 sm:block" />
            </div>
          ))}
        </div>
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
  const [isSaving, setIsSaving] = useState(false)
  const [isMarkingStale, setIsMarkingStale] = useState(false)

  const { isLoaded: clerkLoaded, isSignedIn } = useAuth()
  const { isAuthenticated } = useConvexAuth()
  const createPortfolio = useMutation(api.portfolios.create)
  const saveResearchToPortfolio = useMutation(
    api.portfolios.saveResearchToPortfolio
  )
  const markSymbolResearchStale = useMutation(api.research.markSymbolResearchStale)

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
  const isCreatingNewPortfolio = saveTargetValue === NEW_PORTFOLIO_VALUE
  const saveTargetPortfolioId = isCreatingNewPortfolio
    ? null
    : (saveTargetValue as Id<"portfolios">)

  const symbolInSaveTarget = useQuery(
    api.portfolios.isSymbolInPortfolio,
    isAuthenticated &&
      me &&
      saveTargetPortfolioId &&
      results?.run.symbol
      ? {
          portfolioId: saveTargetPortfolioId,
          symbol: results.run.symbol,
        }
      : "skip",
  )
  const isAlreadyInSaveTarget = symbolInSaveTarget === true
  const saveDisabled = isSaving || isAlreadyInSaveTarget
  const saveTargetPortfolioName =
    saveTargetPortfolioId !== null
      ? (portfolioList.find((portfolio) => portfolio._id === saveTargetPortfolioId)
          ?.name ?? "this portfolio")
      : null

  const querying = results === undefined
  const runningOrQueued =
    results !== undefined &&
    results !== null &&
    (results.run.status === "queued" || results.run.status === "running")

  async function handleSave() {
    if (!isAuthenticated || !me) {
      toast.error(
        clerkLoaded && isSignedIn
          ? "Connecting your account—try again in a moment."
          : "Sign in with Google to save this ticker to a portfolio."
      )
      return
    }

    if (!results || results.events.length === 0) {
      toast.error("No catalyst events to save for this run.")
      return
    }

    setIsSaving(true)
    try {
      const selectedPortfolioValue =
        portfolioSelection || portfolios?.[0]?._id || NEW_PORTFOLIO_VALUE
      const createdNewPortfolio =
        selectedPortfolioValue === NEW_PORTFOLIO_VALUE
      const portfolioId = createdNewPortfolio
        ? await createPortfolio({
            name: portfolioName,
          })
        : (selectedPortfolioValue as Id<"portfolios">)
      const targetPortfolioName = createdNewPortfolio
        ? portfolioName.trim() || "My Portfolio"
        : (portfolioList.find((portfolio) => portfolio._id === portfolioId)
            ?.name ?? "your portfolio")

      const saveResult = await saveResearchToPortfolio({
        portfolioId,
        symbol: results.run.symbol,
      })

      if (saveResult.alreadyInPortfolio) {
        toast.info(
          `${results.run.symbol} is already in ${targetPortfolioName}`,
        )
      } else {
        toast.success(`Saved ${results.run.symbol} to ${targetPortfolioName}`)
      }
    } catch (error) {
      showConvexMutationErrorToast(error, "Could not save to portfolio.")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleMarkStale() {
    if (!results) {
      return
    }

    setIsMarkingStale(true)
    try {
      await markSymbolResearchStale({ symbol: results.run.symbol })
      toast.success("Marked stale — next search will run fresh research.")
    } catch (error) {
      showConvexMutationErrorToast(error, "Could not mark research as stale.")
    } finally {
      setIsMarkingStale(false)
    }
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
      <ResultsSkeleton
        symbol={results?.run.symbol ?? tickerSymbol}
        companyName={results?.companyName}
        runId={runId}
        anonymousTokenHash={anonymousTokenHash}
      />
    )
  }

  const isCompletedWithEvents =
    results.run.status === "completed" && results.events.length > 0

  return (
    <div className={RESULTS_SHELL}>
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="flex items-center gap-2.5 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            <span className="bg-gradient-brand flex size-9 shrink-0 items-center justify-center rounded-xl text-primary-foreground shadow-sm">
              <Sparkles className="size-4.5" aria-hidden />
            </span>
            <span>
              <ResearchRunHeading
                symbol={results.run.symbol}
                companyName={results.companyName}
                suffix="catalysts"
              />
            </span>
          </h1>
          <StatusBadge
            status={results.run.status}
            cacheHit={results.run.cacheHit}
          />
        </div>
        {isCompletedWithEvents ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {isAdminUser(me) ? (
              <Button
                variant="outline"
                onClick={handleMarkStale}
                disabled={isMarkingStale}
                className="w-full cursor-pointer sm:w-auto"
              >
                {isMarkingStale ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="size-4" aria-hidden />
                )}
                Mark stale
              </Button>
            ) : null}
            <Button
              onClick={handleSave}
              disabled={saveDisabled}
              className="bg-gradient-brand w-full cursor-pointer text-primary-foreground shadow-sm transition-transform hover:scale-[1.02] hover:brightness-105 sm:w-auto"
            >
              {isSaving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Briefcase className="size-4" aria-hidden />
              )}
              Save to portfolio
            </Button>
          </div>
        ) : null}
      </header>

      <div className="mt-6 space-y-4">
        {isCompletedWithEvents ? (
          <Show when="signed-out">
            <Alert className="glass border-0 ring-1 ring-border/60">
              <AlertDescription>
                Sign in with Google to save these catalysts to a portfolio.
              </AlertDescription>
            </Alert>
          </Show>
        ) : null}

        {isCompletedWithEvents ? (
          <Show when="signed-in">
            <div className="glass space-y-4 rounded-2xl p-4 ring-1 ring-border/60 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="portfolio-default-name-results">
                    Default portfolio name
                  </Label>
                  <Input
                    id="portfolio-default-name-results"
                    value={portfolioName}
                    onChange={(event) => setPortfolioName(event.target.value)}
                    disabled={!isCreatingNewPortfolio}
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
              </div>
              {portfolioList.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No portfolios yet. Saving this run creates one with every
                  catalyst from it.
                </p>
              ) : null}
              {isAlreadyInSaveTarget &&
              results?.run.symbol &&
              saveTargetPortfolioName ? (
                <p className="text-sm text-muted-foreground">
                  {results.run.symbol} is already in {saveTargetPortfolioName}.
                </p>
              ) : null}
            </div>
          </Show>
        ) : null}

        {results.run.error ? (
          <Alert variant="destructive">
            <AlertDescription>{results.run.error}</AlertDescription>
          </Alert>
        ) : null}

        {results.events.length > 0 ? (
          <CatalystEventsTable events={sortedCatalystEvents} />
        ) : results.run.status === "completed" && !results.run.error ? (
          <div className="glass rounded-2xl p-8 text-center ring-1 ring-border/60">
            <p className="text-sm text-muted-foreground">
              No catalyst events were extracted for this run.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
