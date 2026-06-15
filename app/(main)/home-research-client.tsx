"use client"

import { useAuth } from "@clerk/nextjs"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAction, useConvexAuth } from "convex/react"
import { ArrowRight, Loader2, Search, TrendingUp } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { useForm } from "react-hook-form"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import {
  researchFormSchema,
  type ResearchFormValues,
} from "@/lib/research-form-schema"
import { writeActiveResearchSession } from "@/lib/research-run-session-storage"
import type { AnonymousResearchRunResponse } from "@/types/research-ui"

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

export function HomeResearchClient() {
  const router = useRouter()
  const form = useForm<ResearchFormValues>({
    resolver: zodResolver(researchFormSchema),
    defaultValues: { symbol: "" },
    mode: "onChange",
  })

  const [message, setMessage] = useState<string | null>(null)
  const symbolInputRef = useRef<HTMLInputElement>(null)

  const { isLoaded: clerkLoaded, isSignedIn } = useAuth()
  const { isAuthenticated } = useConvexAuth()
  const requestAuthenticatedRun = useAction(
    api.researchActions.requestAuthenticatedRun
  )

  async function onResearchSubmit(values: ResearchFormValues) {
    const normalizedSymbol = values.symbol.trim().toUpperCase()
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
          now: Number(new Date()),
        })
        writeActiveResearchSession(normalizedSymbol, {
          runId: result.runId,
        })
        router.push(`/${normalizedSymbol}`)
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

        writeActiveResearchSession(normalizedSymbol, {
          runId: result.runId,
          anonymousTokenHash: result.anonymousTokenHash,
        })
        router.push(`/${normalizedSymbol}`)
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

  const isSubmitting = form.formState.isSubmitting

  return (
    <section className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center gap-8 px-5 pb-6 sm:px-6 md:pb-12">
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <Badge
          variant="secondary"
          className="glass mb-6 gap-2 rounded-full border-0 px-3.5 py-1.5 text-xs font-medium ring-1 ring-border/60"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/70" />
            <span className="bg-gradient-brand relative inline-flex size-2 rounded-full" />
          </span>
          AI-powered stock catalyst research
        </Badge>
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          What&apos;s moving your{" "}
          <span className="text-gradient-brand">stonks?</span>
        </h1>
        <p className="mt-4 max-w-md text-base text-pretty text-muted-foreground sm:text-lg">
          Earnings, launches, and regulatory events that could move a stock
          over the next 12 months.
        </p>

        <Form {...form}>
          <form
            className="mt-9 w-full max-w-xl"
            onSubmit={form.handleSubmit(onResearchSubmit)}
          >
            <FormField
              control={form.control}
              name="symbol"
              render={({ field }) => (
                <FormItem>
                  <div className="group glass relative flex w-full items-center rounded-full p-1.5 shadow-lg ring-1 ring-border/70 transition-shadow focus-within:ring-2 focus-within:ring-primary/60 focus-within:shadow-primary/10">
                    <Search
                      aria-hidden
                      className="pointer-events-none absolute left-5 size-5 text-muted-foreground transition-colors group-focus-within:text-primary"
                    />
                    <FormControl>
                      <Input
                        aria-label="Ticker symbol"
                        autoComplete="off"
                        className="h-12 border-0 bg-transparent pr-14 pl-12 text-base uppercase shadow-none ring-0 outline-none placeholder:normal-case focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
                        maxLength={10}
                        placeholder="Enter a ticker, e.g. AAPL"
                        {...field}
                        ref={(element) => {
                          field.ref(element)
                          symbolInputRef.current = element
                        }}
                        autoFocus
                      />
                    </FormControl>
                    <Button
                      aria-label={
                        isSubmitting ? "Starting research" : "Research"
                      }
                      className="bg-gradient-brand size-11 shrink-0 rounded-full text-primary-foreground shadow-md transition-transform hover:scale-105 hover:brightness-105 disabled:hover:scale-100"
                      disabled={
                        isSubmitting || !form.formState.isValid || !clerkLoaded
                      }
                      size="icon"
                      type="submit"
                    >
                      {isSubmitting ? (
                        <Loader2 className="size-5 animate-spin" />
                      ) : (
                        <ArrowRight className="size-5" />
                      )}
                    </Button>
                  </div>
                  <FormMessage className="mt-2.5 text-center" />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <div className="mt-10 flex w-full max-w-xl flex-col items-center gap-3.5">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <TrendingUp aria-hidden className="size-3.5 shrink-0" />
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
                className="rounded-full border-border/70 bg-card/50 px-3.5 font-medium tracking-wide backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary"
                onClick={() => {
                  form.setValue("symbol", symbol, {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                  requestAnimationFrame(() => {
                    const input = symbolInputRef.current
                    if (!input) return
                    input.focus()
                    input.setSelectionRange(symbol.length, symbol.length)
                  })
                }}
              >
                {symbol}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {message ? (
        <div className="w-full max-w-xl">
          <Alert className="glass text-left">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        </div>
      ) : null}
    </section>
  )
}
