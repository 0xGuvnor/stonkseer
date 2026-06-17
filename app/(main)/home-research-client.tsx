"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRight, Loader2, Search, TrendingUp } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"

import { CmdKHint } from "@/components/cmd-k-hint"
import { HomeTypewriterSubheading } from "@/components/home-typewriter-subheading"
import { TickerTape } from "@/components/ticker-tape"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { useStartResearch } from "@/hooks/use-start-research"
import { cn } from "@/lib/utils"
import { FOCUS_HOME_SEARCH_EVENT } from "@/lib/app-navigation"
import {
  researchFormSchema,
  type ResearchFormValues,
} from "@/lib/research-form-schema"

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
  const form = useForm<ResearchFormValues>({
    resolver: zodResolver(researchFormSchema),
    defaultValues: { symbol: "" },
    mode: "onChange",
  })

  const [message, setMessage] = useState<string | null>(null)
  const symbolInputRef = useRef<HTMLInputElement>(null)

  const { startResearch, clerkLoaded } = useStartResearch()

  // Let the sidebar search trigger / Cmd+K focus this input when on `/`.
  useEffect(() => {
    function focusInput() {
      const input = symbolInputRef.current
      if (!input) return
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    }
    window.addEventListener(FOCUS_HOME_SEARCH_EVENT, focusInput)
    return () => window.removeEventListener(FOCUS_HOME_SEARCH_EVENT, focusInput)
  }, [])

  async function onResearchSubmit(values: ResearchFormValues) {
    setMessage(null)
    const result = await startResearch(values.symbol)
    if (result.status === "error") {
      setMessage(result.message)
    }
  }

  const isSubmitting = form.formState.isSubmitting

  return (
    <div className="relative flex h-full min-h-full flex-col overflow-hidden">
      <section className="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-5 py-10 sm:px-6">
        <div className="mx-auto flex w-full max-w-xl flex-col items-center text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1">
            <span className="size-1.5 animate-signal rounded-full bg-primary" />
            <span className="font-mono text-[11px] font-medium tracking-wide text-muted-foreground">
              AI-powered catalyst research
            </span>
          </div>

          {/* Headline */}
          <h1 className="mt-6 text-balance text-center font-heading text-5xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
            What&apos;s moving
            <br />
            your <span className="text-primary italic">stonks?</span>
          </h1>

          <HomeTypewriterSubheading />

          {/* Search bar */}
          <Form {...form}>
            <form
              className="mt-8 w-full"
              onSubmit={form.handleSubmit(onResearchSubmit)}
            >
              <FormField
                control={form.control}
                name="symbol"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <div
                      className={cn(
                        "relative flex items-center gap-3 rounded-xl border bg-card/80 px-4 py-3 shadow-2xl shadow-black/40 transition-colors",
                        fieldState.invalid
                          ? "border-destructive"
                          : "border-border focus-within:border-primary/60"
                      )}
                    >
                      <Search
                        aria-hidden
                        className="size-5 shrink-0 text-muted-foreground"
                      />
                      <FormControl>
                        <Input
                          aria-label="Ticker symbol"
                          autoComplete="off"
                          className="h-auto flex-1 border-0 bg-transparent p-0 font-mono text-lg text-foreground uppercase shadow-none ring-0 outline-none placeholder:normal-case placeholder:text-muted-foreground/60 focus-visible:border-0 focus-visible:ring-0 aria-invalid:border-transparent aria-invalid:ring-0 md:text-lg dark:bg-transparent dark:aria-invalid:border-transparent dark:aria-invalid:ring-0"
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
                      <CmdKHint className="hidden sm:inline-flex" />
                      <Button
                        aria-label={
                          isSubmitting ? "Starting research" : "Research"
                        }
                        className="size-8 shrink-0 rounded-lg bg-primary text-primary-foreground transition-transform hover:scale-105 hover:bg-primary disabled:hover:scale-100"
                        disabled={
                          isSubmitting ||
                          !form.formState.isValid ||
                          !clerkLoaded
                        }
                        size="icon"
                        type="submit"
                      >
                        {isSubmitting ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <ArrowRight className="size-4" />
                        )}
                      </Button>
                    </div>
                    <FormMessage className="mt-2.5 text-center" />
                  </FormItem>
                )}
              />
            </form>
          </Form>

          {/* Popular tickers */}
          <div className="mt-10 flex w-full flex-col items-center gap-3">
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground/70">
              <TrendingUp aria-hidden className="size-3.5 shrink-0" />
              <span className="font-mono text-[10px] tracking-widest uppercase">
                Popular
              </span>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
              {POPULAR_TICKERS.map((symbol) => (
                <button
                  key={symbol}
                  type="button"
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-card/50 px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-card"
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
                  <span className="font-mono text-sm font-semibold tracking-tight text-foreground">
                    {symbol}
                  </span>
                  <ArrowRight
                    aria-hidden
                    className="size-3.5 text-muted-foreground/50"
                  />
                </button>
              ))}
            </div>
          </div>

          {message ? (
            <div className="mt-6 w-full">
              <Alert className="rounded-lg text-left">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            </div>
          ) : null}
        </div>
      </section>

      <TickerTape />
    </div>
  )
}
