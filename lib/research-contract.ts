import { z } from "zod"

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)

    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

export const catalystSourceSchema = z.object({
  url: z
    .string()
    .min(1)
    .refine(isHttpUrl, "Must be a valid HTTP(S) URL")
    .describe("Absolute HTTP(S) URL for the cited source"),
  title: z.string().min(1),
  publisher: z.string().min(1),
  publishedAt: z.string().optional(),
  quote: z.string().min(1),
  supportsFields: z.array(z.string().min(1)).min(1),
})

export const catalystEventSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  whyItMatters: z.string().min(1),
  eventType: z.enum([
    "earnings",
    "product",
    "regulatory",
    "launch",
    "investor_day",
    "conference",
    "partnership",
    "corporate",
    "macro",
    "legal",
    "other",
  ]),
  expectedDate: z.string().optional(),
  windowStart: z.string().optional(),
  windowEnd: z.string().optional(),
  datePrecision: z.enum(["exact", "month", "quarter", "half", "unknown"]),
  confidence: z.number().min(0).max(1),
  status: z.enum(["confirmed", "likely", "speculative"]),
  expectedImpact: z.enum(["low", "medium", "high"]),
  sources: z.array(catalystSourceSchema).min(1),
})

export const catalystResearchSchema = z.object({
  companyName: z.string().optional(),
  exchange: z.string().optional(),
  events: z.array(catalystEventSchema).max(12),
})

export type CatalystResearch = z.infer<typeof catalystResearchSchema>

export const catalystSourceAiSchema = z.object({
  url: z
    .string()
    .min(1)
    .refine(isHttpUrl, "Must be a valid HTTP(S) URL")
    .describe("Absolute HTTP(S) URL for the cited source"),
  title: z.string().min(1),
  publisher: z.string().min(1),
  publishedAt: z
    .string()
    .nullable()
    .describe("Publication date if known, otherwise null"),
  quote: z.string().min(1),
  supportsFields: z.array(z.string().min(1)).min(1),
})

export const catalystEventAiSchema = z.object({
  title: z.string().min(1),
  summary: z
    .string()
    .min(1)
    .describe(
      "1–2 short sentences max: factual what/when/context from sources only. Do not repeat the title or argue importance; no bullets or long hedging.",
    ),
  whyItMatters: z
    .string()
    .min(1)
    .describe(
      "One short sentence (two only if necessary): why the stock might move (guidance, valuation, regulatory outcome, demand, etc.). Do not restate the summary.",
    ),
  eventType: z
    .enum([
      "earnings",
      "product",
      "regulatory",
      "launch",
      "investor_day",
      "conference",
      "partnership",
      "corporate",
      "macro",
      "legal",
      "other",
    ])
    .describe(
      "One primary label per distinct real-world milestone. If a flagship conference, keynote, or investor forum is also where launches are expected, prefer conference or investor_day over a second product or launch row for the same dates or official page.",
    ),
  expectedDate: z
    .string()
    .nullable()
    .describe("Exact expected date if known, otherwise null"),
  windowStart: z
    .string()
    .nullable()
    .describe("Start of expected event window if known, otherwise null"),
  windowEnd: z
    .string()
    .nullable()
    .describe("End of expected event window if known, otherwise null"),
  datePrecision: z.enum(["exact", "month", "quarter", "half", "unknown"]),
  confidence: z.number().min(0).max(1),
  status: z.enum(["confirmed", "likely", "speculative"]),
  expectedImpact: z.enum(["low", "medium", "high"]),
  sources: z.array(catalystSourceAiSchema).min(1),
})

export const catalystResearchAiSchema = z.object({
  companyName: z
    .string()
    .nullable()
    .describe("Company name if supported by sources, otherwise null"),
  exchange: z
    .string()
    .nullable()
    .describe("Exchange if supported by sources, otherwise null"),
  events: z
    .array(catalystEventAiSchema)
    .max(12)
    .describe(
      "Distinct catalysts only; merge overlapping evidence about the same dated or named occurrence into a single event.",
    ),
})

type CatalystResearchAi = z.infer<typeof catalystResearchAiSchema>

export function normalizeCatalystResearchAi(
  research: CatalystResearchAi,
): CatalystResearch {
  return {
    ...(research.companyName !== null
      ? { companyName: research.companyName }
      : {}),
    ...(research.exchange !== null ? { exchange: research.exchange } : {}),
    events: research.events.map((event) => ({
      title: event.title,
      summary: event.summary,
      whyItMatters: event.whyItMatters,
      eventType: event.eventType,
      ...(event.expectedDate !== null
        ? { expectedDate: event.expectedDate }
        : {}),
      ...(event.windowStart !== null ? { windowStart: event.windowStart } : {}),
      ...(event.windowEnd !== null ? { windowEnd: event.windowEnd } : {}),
      datePrecision: event.datePrecision,
      confidence: event.confidence,
      status: event.status,
      expectedImpact: event.expectedImpact,
      sources: event.sources.map((source) => ({
        url: source.url,
        title: source.title,
        publisher: source.publisher,
        ...(source.publishedAt !== null
          ? { publishedAt: source.publishedAt }
          : {}),
        quote: source.quote,
        supportsFields: source.supportsFields,
      })),
    })),
  }
}
