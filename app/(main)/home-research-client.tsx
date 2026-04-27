"use client"

import { Show, useAuth } from "@clerk/nextjs"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { ArrowRight, Search, TrendingUp } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form"
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

const POPULAR_TICKERS = [
  "AAPL",
  "TSLA",
  "NVDA",
  "MSFT",
  "META",
  "GOOGL",
  "AMD",
  "AMZN",
] as const

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

function ordinalSuffix(day: number): string {
  const mod10 = day % 10
  const mod100 = day % 100
  if (mod100 >= 11 && mod100 <= 13) {
    return "th"
  }
  if (mod10 === 1) {
    return "st"
  }
  if (mod10 === 2) {
    return "nd"
  }
  if (mod10 === 3) {
    return "rd"
  }
  return "th"
}

/** Parses leading YYYY-MM-DD (optionally followed by time) as a calendar local date. */
function tryFormatIsoDatePrefix(raw: string): string | null {
  const s = raw.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (
    !Number.isInteger(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null
  }
  const d = new Date(year, month - 1, day)
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null
  }
  return `${day}${ordinalSuffix(day)} ${SHORT_MONTHS[d.getMonth()]} ${year}`
}

function formatTimingFragment(raw: string): string {
  return tryFormatIsoDatePrefix(raw) ?? raw.trim()
}

/** First letter of each word upper (snake_case → spaced words). */
function formatEnumLabel(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    return raw
  }
  return trimmed
    .split("_")
    .map((part) =>
      part.length === 0
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join(" ")
}

function clientNowMs(): number {
  return Date.now()
}

function eventTimingLabel(event: CatalystEventView) {
  if (event.expectedDate) {
    return formatTimingFragment(event.expectedDate)
  }

  if (event.windowStart && event.windowEnd) {
    return `${formatTimingFragment(event.windowStart)} - ${formatTimingFragment(event.windowEnd)}`
  }

  if (event.windowStart) {
    return `After ${formatTimingFragment(event.windowStart)}`
  }

  if (event.windowEnd) {
    return `By ${formatTimingFragment(event.windowEnd)}`
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

  const portfolioList = portfolios ?? []
  const saveTargetValue =
    portfolioSelection || portfolioList[0]?._id || NEW_PORTFOLIO_VALUE

  return (
    <section className="flex w-full flex-col gap-8 pb-10">
      <div className="flex flex-col items-center px-6 pt-6 md:pt-10">
        <Badge variant="secondary" className="mb-5 px-3 py-1">
          AI-powered catalyst research
        </Badge>
        <h1 className="max-w-3xl text-center font-heading text-3xl font-semibold tracking-tight md:text-4xl">
          What&apos;s moving your{" "}
          <span className="bg-linear-to-r from-primary to-chart-2 bg-clip-text text-transparent">
            stonks?
          </span>
        </h1>
        <p className="mt-4 max-w-xl text-center text-muted-foreground">
          Enter any ticker to get AI-researched catalysts for the next 12 months
          — earnings, product launches, regulatory events, and more.
        </p>

        <Form {...form}>
          <form
            className="mt-8 w-full max-w-xl"
            onSubmit={form.handleSubmit(onResearchSubmit)}
          >
            <FormField
              control={form.control}
              name="symbol"
              render={({ field }) => (
                <FormItem>
                  <div className="relative flex w-full items-center">
                    <Search
                      aria-hidden
                      className="pointer-events-none absolute left-4 size-5 text-muted-foreground"
                    />
                    <FormControl>
                      <Input
                        aria-label="Ticker symbol"
                        autoComplete="off"
                        className="h-14 rounded-full border pr-14 pl-12 uppercase shadow-sm"
                        maxLength={10}
                        placeholder="Enter a ticker, e.g. AAPL"
                        {...field}
                      />
                    </FormControl>
                    <Button
                      aria-label={
                        form.formState.isSubmitting
                          ? "Starting research"
                          : "Research"
                      }
                      className="absolute top-1/2 right-2 size-10 -translate-y-1/2 rounded-full"
                      disabled={
                        form.formState.isSubmitting ||
                        !form.formState.isValid ||
                        !clerkLoaded
                      }
                      size="icon"
                      type="submit"
                    >
                      <ArrowRight className="size-5" />
                    </Button>
                  </div>
                  <FormMessage className="text-center" />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <div className="mt-10 flex w-full max-w-xl flex-col gap-3">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <TrendingUp aria-hidden className="size-4 shrink-0" />
            <span className="text-[0.65rem] font-semibold tracking-[0.2em] uppercase">
              Popular
            </span>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {POPULAR_TICKERS.map((symbol) => (
              <Button
                key={symbol}
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full px-3 font-medium"
                onClick={() =>
                  form.setValue("symbol", symbol, {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
              >
                {symbol}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {message ? (
        <div className="mx-auto w-full max-w-5xl px-6">
          <Alert>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 md:flex-row md:items-stretch">
        <Card className="min-w-0 flex-1 shadow-sm">
          <CardHeader>
            <CardDescription>
              {clerkLoaded && isSignedIn
                ? "Signed-in research uses your account limits instead of the one-time anonymous trial."
                : "Anonymous users get one uncached ticker research run per day."}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="shrink-0 shadow-sm md:w-80">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              Portfolio tracking
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Show when="signed-out">
              <Alert>
                <AlertDescription>
                  Try one ticker first. When you want to save catalysts, sign in
                  with Google and create a portfolio.
                </AlertDescription>
              </Alert>
            </Show>
            <Show when="signed-in">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="portfolio-default-name">
                    Default portfolio name
                  </Label>
                  <Input
                    id="portfolio-default-name"
                    value={portfolioName}
                    onChange={(event) => setPortfolioName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="portfolio-save-target">Save target</Label>
                  <Select
                    value={saveTargetValue}
                    onValueChange={setPortfolioSelection}
                  >
                    <SelectTrigger
                      id="portfolio-save-target"
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
                  <p className="text-sm leading-snug font-medium">
                    Your portfolios
                  </p>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {portfolioList.length > 0 ? (
                      portfolioList.map((portfolio: PortfolioView) => (
                        <p key={portfolio._id}>{portfolio.name}</p>
                      ))
                    ) : (
                      <p>
                        No portfolios yet. Saving a completed run will create
                        one with every catalyst from that run.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </Show>
          </CardContent>
        </Card>
      </div>

      {results ? (
        <div className="mx-auto w-full max-w-5xl px-6">
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
              {results.run.status === "completed" &&
              results.events.length > 0 ? (
                <CardAction>
                  <Button onClick={handleSave}>Save to portfolio</Button>
                </CardAction>
              ) : null}
            </CardHeader>

            <CardContent className="space-y-4">
              {results.run.error ? (
                <Alert variant="destructive">
                  <AlertDescription>{results.run.error}</AlertDescription>
                </Alert>
              ) : null}

              {results.run.status !== "completed" ? (
                <Alert>
                  <AlertDescription>
                    Research is queued or running. Results will appear here when
                    Convex updates the run.
                  </AlertDescription>
                </Alert>
              ) : null}

              {results.events.length > 0 ? (
                <Table className="min-w-[640px]">
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
                        Impact
                      </TableHead>
                      <TableHead className="text-xs tracking-wide text-muted-foreground uppercase">
                        Sources
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.events.map((event: CatalystEventView) => (
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
                        <TableCell className="max-w-56 align-top whitespace-normal text-muted-foreground">
                          {eventTimingLabel(event)}
                        </TableCell>
                        <TableCell className="max-w-40 align-top whitespace-normal">
                          {formatEnumLabel(event.eventType)}
                        </TableCell>
                        <TableCell className="max-w-xs align-top whitespace-normal text-muted-foreground">
                          {formatEnumLabel(event.expectedImpact)}
                        </TableCell>
                        <TableCell className="align-top whitespace-normal">
                          {event.sources.length > 0 ? (
                            <div className="flex flex-col items-start gap-1">
                              {event.sources.map((source) => (
                                <Button
                                  key={source._id}
                                  variant="link"
                                  size="sm"
                                  className="h-auto min-h-0 p-0 font-normal"
                                  asChild
                                >
                                  <a
                                    href={source.url}
                                    rel="noreferrer"
                                    target="_blank"
                                    title={`${source.publisher}: ${source.title}`}
                                  >
                                    <span className="max-w-48 truncate">
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
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </section>
  )
}
