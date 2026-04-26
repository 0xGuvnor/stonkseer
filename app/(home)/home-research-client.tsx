"use client"

import { Show, useAuth } from "@clerk/nextjs"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
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
import {
  researchFormSchema,
  type ResearchFormValues,
} from "@/lib/research-form-schema"
import type {
  AnonymousResearchRunResponse,
  CatalystEventView,
  PortfolioView,
} from "@/types/research-ui"

const NEW_PORTFOLIO_VALUE = "__new__"

function clientNowMs(): number {
  return Date.now()
}

function eventTimingLabel(event: CatalystEventView) {
  if (event.expectedDate) {
    return event.expectedDate
  }

  if (event.windowStart && event.windowEnd) {
    return `${event.windowStart} to ${event.windowEnd}`
  }

  if (event.windowStart) {
    return `After ${event.windowStart}`
  }

  if (event.windowEnd) {
    return `By ${event.windowEnd}`
  }

  return event.datePrecision === "unknown"
    ? "Timing unknown"
    : `Timing: ${event.datePrecision}`
}

export function HomeResearchClient() {
  const form = useForm<ResearchFormValues>({
    resolver: zodResolver(researchFormSchema),
    defaultValues: { symbol: "" },
    mode: "onChange",
  })

  const [runId, setRunId] = useState<Id<"researchRuns"> | null>(null)
  const [anonymousTokenHash, setAnonymousTokenHash] = useState<
    string | undefined
  >()
  const [portfolioName, setPortfolioName] = useState("My Portfolio")
  const [portfolioSelection, setPortfolioSelection] = useState<string>("")
  const [message, setMessage] = useState<string | null>(null)

  const { isLoaded: clerkLoaded, isSignedIn } = useAuth()
  const { isAuthenticated } = useConvexAuth()
  const requestAuthenticatedRun = useAction(
    api.researchActions.requestAuthenticatedRun
  )
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
    runId !== null &&
    (anonymousTokenHash !== undefined || hasAuthenticatedRunAccess)
  const results = useQuery(
    api.research.getRunResults,
    shouldLoadResults ? { runId, anonymousTokenHash } : "skip"
  )

  async function onResearchSubmit(values: ResearchFormValues) {
    const normalizedSymbol = values.symbol.trim().toUpperCase()
    const nowMs = clientNowMs()
    setMessage(null)

    try {
      if (!clerkLoaded) {
        setMessage("Checking your session. Try again in a moment.")
        return
      }

      if (isSignedIn && !isAuthenticated) {
        setMessage("Connecting your account. Try again in a moment.")
        return
      }

      if (isSignedIn) {
        const result = await requestAuthenticatedRun({
          symbol: normalizedSymbol,
          now: nowMs,
        })
        setRunId(result.runId)
        setAnonymousTokenHash(undefined)
      } else {
        const response = await fetch("/api/research/anonymous", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ symbol: normalizedSymbol }),
        })
        const result = (await response.json()) as AnonymousResearchRunResponse

        if (!response.ok || "error" in result) {
          throw new Error(
            "error" in result ? result.error : "Unable to start research"
          )
        }

        setRunId(result.runId)
        setAnonymousTokenHash(result.anonymousTokenHash)
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "Research failed"
      setMessage(
        clerkLoaded &&
          isSignedIn &&
          (text === "Not authenticated" ||
            text.toLowerCase().includes("unauthenticated"))
          ? `${text} If this persists, add a Clerk JWT template named "convex" and set CLERK_JWT_ISSUER_DOMAIN in Convex.`
          : text
      )
    }
  }

  async function handleSave() {
    if (!isAuthenticated || !me) {
      setMessage(
        clerkLoaded && isSignedIn
          ? "Connecting your account—try again in a moment."
          : "Sign in with Google to save this ticker to a portfolio."
      )
      return
    }

    if (!results || results.events.length === 0) {
      setMessage("No catalyst events to save for this run.")
      return
    }

    const eventIds = results.events.map((event) => event._id)

    setMessage(null)
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
    setMessage(
      `Saved ${results.run.symbol} (${eventIds.length} catalyst${eventIds.length === 1 ? "" : "s"}) to your portfolio.`
    )
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-6 md:flex-row md:items-stretch">
        <div className="min-w-0 flex-1 rounded-3xl border bg-card p-6 shadow-sm">
          <p className="mb-3 text-sm font-medium text-muted-foreground">
            {clerkLoaded && isSignedIn
              ? "Signed-in research uses your account limits instead of the one-time anonymous trial."
              : "Anonymous users get one uncached ticker research run per day."}
          </p>
          <Form {...form}>
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-start"
              onSubmit={form.handleSubmit(onResearchSubmit)}
            >
              <FormField
                control={form.control}
                name="symbol"
                render={({ field }) => (
                  <FormItem className="min-w-0 flex-1">
                    <FormControl>
                      <Input
                        aria-label="Ticker symbol"
                        autoComplete="off"
                        className="uppercase"
                        maxLength={10}
                        placeholder="TSLA"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                disabled={
                  form.formState.isSubmitting ||
                  !form.formState.isValid ||
                  !clerkLoaded
                }
                type="submit"
              >
                {form.formState.isSubmitting ? "Starting..." : "Research"}
              </Button>
            </form>
          </Form>
          {message ? (
            <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm">
              {message}
            </p>
          ) : null}
        </div>

        <aside className="shrink-0 rounded-3xl border bg-card p-6 shadow-sm md:w-80">
          <h2 className="mb-3 text-lg font-semibold">Portfolio tracking</h2>
          <Show when="signed-out">
            <p className="text-sm leading-6 text-muted-foreground">
              Try one ticker first. When you want to save catalysts, sign in
              with Google and create a portfolio.
            </p>
          </Show>
          <Show when="signed-in">
            <div className="space-y-4">
              <label className="block text-sm font-medium">
                Default portfolio name
                <input
                  className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm ring-ring transition outline-none focus:ring-2"
                  value={portfolioName}
                  onChange={(event) => setPortfolioName(event.target.value)}
                />
              </label>
              <label className="block text-sm font-medium">
                Save target
                <select
                  className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm ring-ring transition outline-none focus:ring-2"
                  value={
                    portfolioSelection ||
                    portfolios?.[0]?._id ||
                    NEW_PORTFOLIO_VALUE
                  }
                  onChange={(event) =>
                    setPortfolioSelection(event.target.value)
                  }
                >
                  {portfolios?.map((portfolio: PortfolioView) => (
                    <option key={portfolio._id} value={portfolio._id}>
                      {portfolio.name}
                    </option>
                  ))}
                  <option value={NEW_PORTFOLIO_VALUE}>
                    Create {portfolioName}
                  </option>
                </select>
              </label>
              <div>
                <p className="mb-2 text-sm font-medium">Your portfolios</p>
                <div className="space-y-2 text-sm text-muted-foreground">
                  {portfolios?.length ? (
                    portfolios.map((portfolio: PortfolioView) => (
                      <p key={portfolio._id}>{portfolio.name}</p>
                    ))
                  ) : (
                    <p>
                      No portfolios yet. Saving a completed run will create one
                      with every catalyst from that run.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Show>
        </aside>
      </div>

      {results ? (
        <div className="rounded-3xl border bg-card p-6 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">
                {results.run.symbol} catalyst research
              </h2>
              <p className="text-sm text-muted-foreground">
                Status: {results.run.status}
                {results.run.cacheHit ? " (cached)" : ""}
              </p>
            </div>
            {results.run.status === "completed" && results.events.length > 0 ? (
              <Button onClick={handleSave}>Save to portfolio</Button>
            ) : null}
          </div>

          {results.run.error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
              {results.run.error}
            </p>
          ) : null}

          {results.run.status !== "completed" ? (
            <p className="text-sm text-muted-foreground">
              Research is queued or running. Results will appear here when
              Convex updates the run.
            </p>
          ) : null}

          {results.events.length > 0 ? (
            <Table className="min-w-[880px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs tracking-wide text-muted-foreground uppercase">
                    Catalyst
                  </TableHead>
                  <TableHead className="text-xs tracking-wide text-muted-foreground uppercase">
                    Why it matters
                  </TableHead>
                  <TableHead className="text-xs tracking-wide text-muted-foreground uppercase">
                    When
                  </TableHead>
                  <TableHead className="text-xs tracking-wide text-muted-foreground uppercase">
                    Type
                  </TableHead>
                  <TableHead className="text-xs tracking-wide text-muted-foreground uppercase">
                    Status
                  </TableHead>
                  <TableHead className="text-xs tracking-wide text-muted-foreground uppercase">
                    Impact
                  </TableHead>
                  <TableHead className="text-right text-xs tracking-wide text-muted-foreground uppercase">
                    Conf.
                  </TableHead>
                  <TableHead className="text-xs tracking-wide text-muted-foreground uppercase">
                    Sources
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.events.map((event: CatalystEventView) => {
                  const sourcesTitle = event.sources
                    .map((s) => `${s.publisher}: ${s.title}`)
                    .join("\n")
                  const primary = event.sources[0]

                  return (
                    <TableRow key={event._id}>
                      <TableCell className="max-w-md align-top whitespace-normal">
                        <div className="space-y-2">
                          <div className="font-medium">{event.title}</div>
                          {event.summary.trim() ? (
                            <p className="text-sm leading-snug font-normal text-muted-foreground">
                              {event.summary}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs align-top whitespace-normal text-muted-foreground">
                        {event.whyItMatters.trim() ? (
                          event.whyItMatters
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        className="max-w-56 align-top whitespace-normal text-muted-foreground"
                        title={eventTimingLabel(event)}
                      >
                        {eventTimingLabel(event)}
                      </TableCell>
                      <TableCell className="max-w-40 align-top whitespace-normal">
                        {event.eventType}
                      </TableCell>
                      <TableCell className="max-w-40 align-top whitespace-normal text-muted-foreground">
                        {event.status}
                      </TableCell>
                      <TableCell className="max-w-xs align-top whitespace-normal text-muted-foreground">
                        {event.expectedImpact}
                      </TableCell>
                      <TableCell className="text-right align-top whitespace-normal text-muted-foreground tabular-nums">
                        {Math.round(event.confidence * 100)}%
                      </TableCell>
                      <TableCell className="align-top whitespace-normal">
                        {primary ? (
                          <a
                            className="text-primary underline-offset-4 hover:underline"
                            href={primary.url}
                            rel="noreferrer"
                            target="_blank"
                            title={sourcesTitle || undefined}
                          >
                            {event.sources.length > 1
                              ? `${event.sources.length} links`
                              : "Link"}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
