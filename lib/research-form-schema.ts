import { z } from "zod"

import { TICKER_SYMBOL_PATTERN } from "./ticker-symbol"

export const researchFormSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, "Enter a ticker symbol")
    .max(10, "Ticker must be 10 characters or less")
    .regex(
      new RegExp(TICKER_SYMBOL_PATTERN.source, "i"),
      "Start with a letter and use letters, numbers, dots, or hyphens only"
    ),
})

export type ResearchFormValues = z.infer<typeof researchFormSchema>
