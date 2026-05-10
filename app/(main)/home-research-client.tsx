"use client"

import { useAuth } from "@clerk/nextjs"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAction, useConvexAuth } from "convex/react"
import { ArrowRight, Search, TrendingUp } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
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

  return (
    <section className="mx-auto flex min-h-[calc(100svh-2.75rem)] w-full max-w-3xl flex-col items-center justify-center gap-8 px-6 pb-12 md:min-h-svh">
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <Badge variant="secondary" className="mb-5 px-3 py-1">
          <span className="size-1.5 animate-pulse rounded-full bg-green-500" />
          AI-powered stocks catalyst research
        </Badge>
        <h1 className="max-w-3xl font-heading text-3xl font-semibold tracking-tight md:text-4xl">
          What&apos;s moving your{" "}
          <span className="bg-linear-to-r from-primary to-chart-2 bg-clip-text text-transparent">
            stonks?
          </span>
        </h1>
        <p className="mt-4 max-w-xl text-muted-foreground">
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
                        className="h-14 rounded-full border pr-14 pl-12 uppercase shadow-sm placeholder:normal-case"
                        maxLength={10}
                        placeholder="Enter a ticker, e.g. AAPL"
                        {...field}
                        autoFocus
                      />
                    </FormControl>
                    <Button
                      aria-label={
                        form.formState.isSubmitting
                          ? "Starting research"
                          : "Research"
                      }
                      className="absolute top-1/2 right-2 size-10 -translate-y-1/2 rounded-full active:not-aria-[haspopup]:-translate-y-1/2"
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
        <div className="w-full max-w-xl">
          <Alert className="text-left">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        </div>
      ) : null}
    </section>
  )
}
