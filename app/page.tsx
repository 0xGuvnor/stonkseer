"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Show, SignInButton, UserButton } from "@clerk/nextjs"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import Image from "next/image"
import Link from "next/link"
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
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import {
  researchFormSchema,
  type ResearchFormValues,
} from "@/lib/research-form-schema"
import type {
  AnonymousResearchRunResponse,
  CatalystEventView,
  EventSourceView,
  PortfolioView,
} from "@/types/research-ui"

function clientNowMs(): number {
  return Date.now()
}

export default function Page() {
  const form = useForm<ResearchFormValues>({
    resolver: zodResolver(researchFormSchema),
    defaultValues: { symbol: "" },
    mode: "onChange",
  })

  const [runId, setRunId] = useState<Id<"researchRuns"> | null>(null)
  const [anonymousTokenHash, setAnonymousTokenHash] = useState<
    string | undefined
  >()
  const [selectedEventIds, setSelectedEventIds] = useState<
    Array<Id<"catalystEvents">>
  >([])
  const [portfolioName, setPortfolioName] = useState("My Portfolio")
  const [message, setMessage] = useState<string | null>(null)

  const { isAuthenticated } = useConvexAuth()
  const requestAuthenticatedRun = useMutation(
    api.research.requestAuthenticatedRun
  )
  const createPortfolio = useMutation(api.portfolios.create)
  const saveResearchToPortfolio = useMutation(
    api.portfolios.saveResearchToPortfolio
  )
  const portfolios = useQuery(
    api.portfolios.listMine,
    isAuthenticated ? {} : "skip"
  )
  const results = useQuery(
    api.research.getRunResults,
    runId ? { runId, anonymousTokenHash } : "skip"
  )

  async function onResearchSubmit(values: ResearchFormValues) {
    const normalizedSymbol = values.symbol.trim().toUpperCase()
    const nowMs = clientNowMs()
    setMessage(null)
    setSelectedEventIds([])

    try {
      if (isAuthenticated) {
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
      setMessage(error instanceof Error ? error.message : "Research failed")
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
        : [...current, eventId]
    )
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-6 px-6 py-5">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/"
            className="shrink-0 rounded-md ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <Image
              src="/logo.png"
              alt="Stonkseer"
              width={48}
              height={48}
              className="size-12"
              priority
            />
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
              Stonkseer
            </p>
            <h1 className="font-heading text-2xl leading-tight font-semibold">
              Track upcoming stock catalysts
            </h1>
          </div>
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
                    form.formState.isSubmitting || !form.formState.isValid
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
                        <span className="block text-xs tracking-wide text-muted-foreground uppercase">
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
                  className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm ring-ring transition outline-none focus:ring-2"
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
                    <p>
                      No portfolios yet. Saving selected events will create one.
                    </p>
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
