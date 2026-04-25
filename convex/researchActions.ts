"use node"

import { generateText, Output } from "ai"
import { z } from "zod"

import { internal } from "./_generated/api"
import { internalAction } from "./_generated/server"
import { v } from "convex/values"
import {
  catalystResearchSchema,
  type CatalystResearch,
} from "../lib/research-contract"

const yahooCalendarSchema = z.object({
  quoteSummary: z.object({
    result: z
      .array(
        z.object({
          price: z
            .object({
              longName: z.string().optional(),
              exchangeName: z.string().optional(),
            })
            .optional(),
          calendarEvents: z
            .object({
              earnings: z
                .object({
                  earningsDate: z
                    .array(
                      z.object({
                        raw: z.number().optional(),
                        fmt: z.string().optional(),
                      }),
                    )
                    .optional(),
                })
                .optional(),
            })
            .optional(),
        }),
      )
      .nullable(),
  }),
})

const MAX_RESEARCH_ATTEMPTS = 2

const tavilySearchSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().optional(),
        url: z.string().optional(),
        content: z.string().optional(),
        published_date: z.string().optional(),
      }),
    )
    .optional(),
})

type SourceSnippet = {
  url: string
  title: string
  publisher: string
  quote: string
  publishedAt?: string
}

function buildSearchQueries(symbol: string) {
  return [
    `${symbol} investor relations upcoming events earnings launch catalyst`,
    `${symbol} product launch investor day upcoming earnings call`,
    `${symbol} regulatory milestone upcoming catalyst next 12 months`,
  ]
}

function yahooQuoteSummaryUrl(symbol: string) {
  return `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    symbol,
  )}?modules=calendarEvents,price`
}

async function fetchYahooCalendar(symbol: string): Promise<{
  companyName?: string
  exchange?: string
  snippets: SourceSnippet[]
}> {
  const url = yahooQuoteSummaryUrl(symbol)
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "stonkseer-research-bot/0.1",
    },
  })

  if (!response.ok) {
    return { snippets: [] }
  }

  const parsed = yahooCalendarSchema.safeParse(await response.json())

  if (!parsed.success) {
    return { snippets: [] }
  }

  const result = parsed.data.quoteSummary.result?.[0]
  const earningsDate = result?.calendarEvents?.earnings?.earningsDate?.[0]
  const snippets: SourceSnippet[] = []

  if (earningsDate?.fmt) {
    snippets.push({
      url,
      title: `${symbol} quote summary calendar events`,
      publisher: "Yahoo Finance",
      quote: `Yahoo Finance calendar data lists an earnings date/window of ${earningsDate.fmt}.`,
    })
  }

  return {
    companyName: result?.price?.longName,
    exchange: result?.price?.exchangeName,
    snippets,
  }
}

async function fetchWebSearchSnippets(
  symbol: string,
  maxQueries: number,
): Promise<SourceSnippet[]> {
  const apiKey = process.env.TAVILY_API_KEY

  if (!apiKey) {
    return []
  }

  const snippets: SourceSnippet[] = []

  for (const query of buildSearchQueries(symbol).slice(0, maxQueries)) {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: 3,
        include_answer: false,
      }),
    })

    if (!response.ok) {
      continue
    }

    const parsed = tavilySearchSchema.safeParse(await response.json())

    if (!parsed.success) {
      continue
    }

    for (const result of parsed.data.results ?? []) {
      if (!result.url || !result.title || !result.content) {
        continue
      }

      snippets.push({
        url: result.url,
        title: result.title,
        publisher: new URL(result.url).hostname.replace(/^www\./, ""),
        publishedAt: result.published_date,
        quote: result.content.slice(0, 600),
      })
    }
  }

  return snippets.slice(0, 8)
}

function buildDeterministicEvents(
  symbol: string,
  snippets: SourceSnippet[],
): CatalystResearch["events"] {
  const earningsSnippet = snippets.find((snippet) =>
    snippet.quote.toLowerCase().includes("earnings"),
  )

  if (!earningsSnippet) {
    return []
  }

  return [
    {
      title: `${symbol} earnings calendar window`,
      summary:
        "A near-term earnings window was found in a finance calendar source. Treat this as a starting point and verify against the company's investor relations site before trading.",
      whyItMatters:
        "Earnings calls can update guidance, margins, demand signals, capital allocation, and management commentary.",
      eventType: "earnings",
      datePrecision: "unknown",
      confidence: 0.55,
      status: "likely",
      expectedImpact: "medium",
      sources: [
        {
          url: earningsSnippet.url,
          title: earningsSnippet.title,
          publisher: earningsSnippet.publisher,
          publishedAt: earningsSnippet.publishedAt,
          quote: earningsSnippet.quote,
          supportsFields: ["eventType", "summary"],
        },
      ],
    },
  ]
}

async function buildAiEvents(
  symbol: string,
  snippets: SourceSnippet[],
): Promise<CatalystResearch | null> {
  const model = process.env.AI_GATEWAY_MODEL

  if (!model || snippets.length === 0) {
    return null
  }

  const { output } = await generateText({
    model,
    output: Output.object({
      schema: catalystResearchSchema,
    }),
    prompt: [
      `Extract upcoming catalyst events for ${symbol} over the next 12 months.`,
      "Use only the source snippets below. Do not invent events.",
      "Every event must include at least one source and should be marked speculative unless the source clearly confirms timing.",
      JSON.stringify(snippets, null, 2),
    ].join("\n\n"),
  })

  return output
}

export const runResearch = internalAction({
  args: {
    runId: v.id("researchRuns"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.researchInternal.getRun, {
      runId: args.runId,
    })

    if (!run) {
      throw new Error("Research run not found")
    }

    if (run.attemptCount >= MAX_RESEARCH_ATTEMPTS) {
      await ctx.runMutation(internal.researchInternal.markFailed, {
        runId: args.runId,
        error: "Research retry limit reached",
      })
      return null
    }

    await ctx.runMutation(internal.researchInternal.markStarted, {
      runId: args.runId,
      model: process.env.AI_GATEWAY_MODEL,
    })

    try {
      const yahoo = await fetchYahooCalendar(run.symbol)
      const webSnippets = await fetchWebSearchSnippets(
        run.symbol,
        run.source === "anonymous" ? 1 : 3,
      )
      const snippets = [...yahoo.snippets, ...webSnippets]
      const aiResearch = await buildAiEvents(run.symbol, snippets)
      const events =
        aiResearch?.events ?? buildDeterministicEvents(run.symbol, snippets)

      if (events.length === 0) {
        throw new Error(
          "No cited catalyst events found. Configure AI_GATEWAY_MODEL and a web/news search provider before relying on broad catalyst discovery.",
        )
      }

      await ctx.runMutation(internal.researchInternal.upsertResearchResults, {
        runId: args.runId,
        symbol: run.symbol,
        companyName: aiResearch?.companyName ?? yahoo.companyName,
        exchange: aiResearch?.exchange ?? yahoo.exchange,
        events,
        model: process.env.AI_GATEWAY_MODEL ?? "deterministic-yahoo-calendar",
      })
    } catch (error) {
      await ctx.runMutation(internal.researchInternal.markFailed, {
        runId: args.runId,
        error:
          error instanceof Error
            ? error.message
            : "Research failed for an unknown reason",
      })
    }

    return null
  },
})

export const refreshTrackedStocks = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const queuedRunIds = await ctx.runMutation(
      internal.researchInternal.queueTrackedRefreshes,
      { now: Date.now() },
    )

    for (const runId of queuedRunIds) {
      await ctx.runAction(internal.researchActions.runResearch, { runId })
    }

    return null
  },
})
