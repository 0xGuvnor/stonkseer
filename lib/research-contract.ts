import { z } from "zod"

export const catalystSourceSchema = z.object({
  url: z.url(),
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
