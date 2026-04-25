import { z } from "zod"

export const researchFormSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, "Enter a ticker symbol")
    .max(10, "Ticker must be 10 characters or less")
    .regex(
      /^[A-Za-z0-9.\-]+$/,
      "Use letters, numbers, dots, or hyphens only"
    ),
})

export type ResearchFormValues = z.infer<typeof researchFormSchema>
