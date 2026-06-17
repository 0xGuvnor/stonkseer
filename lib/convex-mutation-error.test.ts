import { describe, expect, test } from "bun:test"
import { ConvexError } from "convex/values"

import { getConvexMutationUserMessage } from "./convex-mutation-error"

describe("getConvexMutationUserMessage", () => {
  test("returns ConvexError string data", () => {
    const message = getConvexMutationUserMessage(
      new ConvexError("You already have a portfolio with this name"),
      "Fallback",
    )

    expect(message).toBe("You already have a portfolio with this name")
  })

  test("extracts message from Convex hybrid error string", () => {
    const message = getConvexMutationUserMessage(
      new Error(
        "[CONVEX M(portfolios:create)] [Request ID: abc] Server Error Uncaught Error: You already have a portfolio with this name at assertPortfolioNameAvailable (../convex/portfolios.ts:52:0)\n  Called by client",
      ),
      "Fallback",
    )

    expect(message).toBe("You already have a portfolio with this name")
  })

  test("returns ConvexError string data for research quota", () => {
    const quotaMessage =
      "You've used all 10 research runs in the last 24 hours. Cached results from the past 7 days don't count toward this limit—try a ticker you've researched recently, or try again tomorrow."
    const message = getConvexMutationUserMessage(
      new ConvexError(quotaMessage),
      "Unable to start research",
    )

    expect(message).toBe(quotaMessage)
  })

  test("returns fallback for sanitized action errors", () => {
    const message = getConvexMutationUserMessage(
      new Error(
        "[CONVEX A(researchActions:requestAuthenticatedRun)] [Request ID: abc] Server Error Called by client",
      ),
      "Unable to start research",
    )

    expect(message).toBe("Unable to start research")
  })

  test("returns fallback for unknown errors", () => {
    expect(getConvexMutationUserMessage(null, "Could not create portfolio.")).toBe(
      "Could not create portfolio.",
    )
  })
})
