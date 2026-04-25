"use client"

import { FormEvent, useMemo, useState } from "react"
import { SignInButton, UserButton, Show } from "@clerk/nextjs"
import { useMutation, useQuery } from "convex/react"
import { useConvexAuth } from "convex/react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"

type EventSourceView = {
  _id: Id<"eventSources">
  url: string
  title: string
  publisher: string
}

type CatalystEventView = {
  _id: Id<"catalystEvents">
  title: string
  summary: string
  eventType: string
  status: string
  confidence: number
  sources: EventSourceView[]
}

type PortfolioView = {
  _id: Id<"portfolios">
  name: string
}

export default function Page() {
  const [symbol, setSymbol] = useState("")
  const [runId, setRunId] = useState<Id<"researchRuns"> | null>(null)
  const [anonymousTokenHash, setAnonymousTokenHash] = useState<
    string | undefined
  >()
  const [selectedEventIds, setSelectedEventIds] = useState<
    Array<Id<"catalystEvents">>
  >([])
  const [portfolioName, setPortfolioName] = useState("My Portfolio")
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { isAuthenticated } = useConvexAuth()
  const requestAuthenticatedRun = useMutation(api.research.requestAuthenticatedRun)
  const createPortfolio = useMutation(api.portfolios.create)
  const saveResearchToPortfolio = useMutation(
    api.portfolios.saveResearchToPortfolio,
  )
  const portfolios = useQuery(
    api.portfolios.listMine,
    isAuthenticated ? {} : "skip",
  )
  const results = useQuery(
    api.research.getRunResults,
    runId ? { runId, anonymousTokenHash } : "skip",
  )
  const normalizedSymbol = useMemo(() => symbol.trim().toUpperCase(), [symbol])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setSelectedEventIds([])
    setIsSubmitting(true)

    try {
      if (isAuthenticated) {
        const result = await requestAuthenticatedRun({
          symbol: normalizedSymbol,
          now: Date.now(),
        })
        setRunId(result.runId)
        setAnonymousTokenHash(undefined)
      } else {
        const response = await fetch("/api/research/anonymous", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ symbol: normalizedSymbol }),
        })
        const result = (await response.json()) as
          | {
              runId: Id<"researchRuns">
              anonymousTokenHash: string
            }
          | { error: string }

        if (!response.ok || "error" in result) {
          throw new Error(
            "error" in result ? result.error : "Unable to start research",
          )
        }

        setRunId(result.runId)
        setAnonymousTokenHash(result.anonymousTokenHash)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Research failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSave() {
    if (!isAuthenticated) {
      setMessage("Sign in with Google to save this ticker to a portfolio.")
      return
    }

    if (!results || selectedEventIds.length === 0) {
      setMessage("Select at least one catalyst event to save.")
      return
    }

    setMessage(null)
    const portfolioId =
      portfolios?.[0]?._id ??
      (await createPortfolio({
        name: portfolioName,
      }))

    await saveResearchToPortfolio({
      portfolioId,
      symbol: results.run.symbol,
      eventIds: selectedEventIds,
    })
    setMessage(`Saved ${results.run.symbol} to your portfolio.`)
  }

  function toggleEvent(eventId: Id<"catalystEvents">) {
    setSelectedEventIds((current) =>
      current.includes(eventId)
        ? current.filter((selectedEventId) => selectedEventId !== eventId)
        : [...current, eventId],
    )
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Stonkseer
          </p>
          <h1 className="font-heading text-2xl font-semibold">
            Track upcoming stock catalysts
          </h1>
        </div>
        <Show when="signed-out">
          <SignInButton mode="modal">
            <Button variant="outline">Sign in with Google</Button>
          </SignInButton>
        </Show>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </header>

      <section className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-10 md:grid-cols-[1fr_0.8fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border bg-card p-6 shadow-sm">
            <p className="mb-3 text-sm font-medium text-muted-foreground">
              Anonymous users get one uncached ticker research run per day.
            </p>
            <form className="flex gap-3" onSubmit={handleSubmit}>
              <input
                aria-label="Ticker symbol"
                className="min-w-0 flex-1 rounded-md border bg-background px-4 py-2 text-sm uppercase outline-none ring-ring transition focus:ring-2"
                maxLength={10}
                placeholder="TSLA"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
              />
              <Button disabled={isSubmitting || normalizedSymbol.length === 0}>
                {isSubmitting ? "Starting..." : "Research"}
              </Button>
            </form>
            {message ? (
              <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm">
                {message}
              </p>
            ) : null}
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
                {results.run.status === "completed" &&
                results.events.length > 0 ? (
                  <Button onClick={handleSave}>Save selected</Button>
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

              <div className="space-y-4">
                {results.events.map((event: CatalystEventView) => (
                  <article
                    className="rounded-2xl border bg-background p-4"
                    key={event._id}
                  >
                    <label className="flex gap-3">
                      <input
                        checked={selectedEventIds.includes(event._id)}
                        className="mt-1"
                        type="checkbox"
                        onChange={() => toggleEvent(event._id)}
                      />
                      <span className="space-y-2">
                        <span className="block font-medium">{event.title}</span>
                        <span className="block text-sm text-muted-foreground">
                          {event.summary}
                        </span>
                        <span className="block text-xs uppercase tracking-wide text-muted-foreground">
                          {event.eventType} · {event.status} · confidence{" "}
                          {Math.round(event.confidence * 100)}%
                        </span>
                      </span>
                    </label>
                    <div className="mt-3 space-y-2 border-t pt-3">
                      {event.sources.map((source: EventSourceView) => (
                        <a
                          className="block text-sm text-primary underline-offset-4 hover:underline"
                          href={source.url}
                          key={source._id}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {source.publisher}: {source.title}
                        </a>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="rounded-3xl border bg-card p-6 shadow-sm">
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
                  className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring transition focus:ring-2"
                  value={portfolioName}
                  onChange={(event) => setPortfolioName(event.target.value)}
                />
              </label>
              <div>
                <p className="mb-2 text-sm font-medium">Your portfolios</p>
                <div className="space-y-2 text-sm text-muted-foreground">
                  {portfolios?.length ? (
                    portfolios.map((portfolio: PortfolioView) => (
                      <p key={portfolio._id}>{portfolio.name}</p>
                    ))
                  ) : (
                    <p>No portfolios yet. Saving selected events will create one.</p>
                  )}
                </div>
              </div>
            </div>
          </Show>
        </aside>
      </section>
    </main>
  )
}
