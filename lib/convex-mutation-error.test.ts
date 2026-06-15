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

  test("returns fallback for unknown errors", () => {
    expect(getConvexMutationUserMessage(null, "Could not create portfolio.")).toBe(
      "Could not create portfolio.",
    )
  })
})
