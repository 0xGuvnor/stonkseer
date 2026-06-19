import { z } from "zod"

import {
  buildResearchHorizonEnd,
  buildResearchRunDate,
  normalizeCatalystEventTiming,
} from "./catalyst-timing"

const MAX_EVENT_SUMMARY_CHARS = 360
const MAX_EVENT_WHY_CHARS = 240
export const MAX_CATALYST_EVENTS = 50

const timingShapeSchema = z.enum([
  "point",
  "closed_window",
  "from",
  "by",
  "period",
  "open",
  "unknown",
])

export const DATE_PRECISION_VALUES = [
  "exact",
  "month",
  "quarter",
  "half",
  "unknown",
] as const

export type DatePrecision = (typeof DATE_PRECISION_VALUES)[number]

const datePrecisionSchema = z.enum(DATE_PRECISION_VALUES)

/** Maps model synonyms (e.g. "year") onto the supported datePrecision enum. */
export function normalizeDatePrecision(value: unknown): DatePrecision {
  if (typeof value !== "string") {
    return "unknown"
  }

  const normalized = value.trim().toLowerCase()

  if ((DATE_PRECISION_VALUES as readonly string[]).includes(normalized)) {
    return normalized as DatePrecision
  }

  switch (normalized) {
    case "day":
    case "days":
    case "date":
    case "week":
    case "weekly":
      return "exact"
    case "monthly":
      return "month"
    case "quarterly":
    case "q1":
    case "q2":
    case "q3":
    case "q4":
      return "quarter"
    case "semester":
    case "semi-annual":
    case "semiannual":
      return "half"
    case "year":
    case "yearly":
    case "annual":
      return "unknown"
    default:
      if (normalized.includes("quarter")) {
        return "quarter"
      }
      if (normalized.includes("month")) {
        return "month"
      }
      if (normalized.includes("half")) {
        return "half"
      }
      return "unknown"
  }
}

const datePrecisionAiSchema = z.preprocess(
  normalizeDatePrecision,
  datePrecisionSchema,
)

function clampResearchText(value: string, maxLen: number): string {
  const t = value.trim()

  if (t.length <= maxLen) {
    return t
  }

  const cut = t.slice(0, maxLen)
  const lastSpace = cut.lastIndexOf(" ")

  const head =
    lastSpace > maxLen * 0.55 ? cut.slice(0, lastSpace).trimEnd() : cut.trimEnd()

  return `${head}…`
}

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
  provenance: z
    .enum([
      "evidence_snippet",
      "report_derived",
      "prior_run_carryforward",
    ])
    .optional(),
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
  timingShape: timingShapeSchema,
  expectedDate: z.string().optional(),
  windowStart: z.string().optional(),
  windowEnd: z.string().optional(),
  periodKey: z.string().optional(),
  datePrecision: datePrecisionSchema,
  confidence: z.number().min(0).max(1),
  status: z.enum(["confirmed", "likely", "speculative"]),
  expectedImpact: z.enum(["low", "medium", "high"]),
  sources: z.array(catalystSourceSchema).min(1),
})

export const catalystResearchSchema = z.object({
  companyName: z.string().optional(),
  exchange: z.string().optional(),
  events: z.array(catalystEventSchema).max(MAX_CATALYST_EVENTS),
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
  timingShape: timingShapeSchema.describe(
    "Timing semantics: point=exact date; closed_window=source-backed start and end; from=has not started yet, begins after windowStart; by=deadline only; period=fuzzy period via periodKey (required when title or sources name a quarter, e.g. Q2 2026 deliveries report → period + 2026-Q2); open=already underway or open-ended, may use past windowStart/periodKey; unknown=only when no year, quarter, month, or date anchor appears in title or cited sources.",
  ),
  expectedDate: z
    .string()
    .nullable()
    .describe("Exact expected date when timingShape is point, otherwise null"),
  windowStart: z
    .string()
    .nullable()
    .describe(
      "Source-stated start when timingShape is from, open, or closed_window. For open, may be in the past when already underway. Never today's run date unless a source explicitly anchors timing to today. Otherwise null.",
    ),
  windowEnd: z
    .string()
    .nullable()
    .describe(
      "Source-stated deadline or bounded window end when timingShape is by or closed_window. Never the 12-month research horizon. Otherwise null.",
    ),
  periodKey: z
    .string()
    .nullable()
    .describe(
      "Fuzzy period YYYY, YYYY-Qn, YYYY-Hn, or YYYY-MM when timingShape is period or open, otherwise null. Canonical quarter form: 2026-Q2 (capital Q). For 'Q2 2026 Vehicle Production & Deliveries Report', use 2026-Q2 — the quarter the data covers, not the release month.",
    ),
  datePrecision: datePrecisionAiSchema.describe(
    'Must be exactly one of: "exact", "month", "quarter", "half", "unknown". Do not use "year", "day", or other labels.',
  ),
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
    .max(MAX_CATALYST_EVENTS)
    .describe(
      "Distinct catalysts only; merge overlapping evidence about the same dated or named occurrence into a single event.",
    ),
})

export type CatalystResearchAi = z.infer<typeof catalystResearchAiSchema>

export function normalizeCatalystResearchAi(
  research: CatalystResearchAi,
  now: number,
): CatalystResearch {
  const researchHorizonEnd = buildResearchHorizonEnd(now)
  const researchRunDate = buildResearchRunDate(now)

  return {
    ...(research.companyName !== null
      ? { companyName: research.companyName }
      : {}),
    ...(research.exchange !== null ? { exchange: research.exchange } : {}),
    events: research.events.map((event) => {
      const normalized = normalizeCatalystEventTiming(
        {
          title: event.title,
          summary: clampResearchText(event.summary, MAX_EVENT_SUMMARY_CHARS),
          whyItMatters: clampResearchText(
            event.whyItMatters,
            MAX_EVENT_WHY_CHARS,
          ),
          eventType: event.eventType,
          timingShape: event.timingShape,
          ...(event.expectedDate !== null
            ? { expectedDate: event.expectedDate }
            : {}),
          ...(event.windowStart !== null
            ? { windowStart: event.windowStart }
            : {}),
          ...(event.windowEnd !== null ? { windowEnd: event.windowEnd } : {}),
          ...(event.periodKey !== null ? { periodKey: event.periodKey } : {}),
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
        },
        { researchHorizonEnd, researchRunDate },
      )

      return normalized
    }),
  }
}
