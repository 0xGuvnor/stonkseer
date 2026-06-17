"use client"

import { useAuth } from "@clerk/nextjs"
import { useAction, useConvexAuth } from "convex/react"
import { useRouter } from "next/navigation"

import { api } from "@/convex/_generated/api"
import { getConvexMutationUserMessage } from "@/lib/convex-mutation-error"
import { writeActiveResearchSession } from "@/lib/research-run-session-storage"
import type { AnonymousResearchRunResponse } from "@/types/research-ui"

export type StartResearchResult =
  | { status: "ok" }
  | { status: "error"; message: string }

/**
 * Shared "start a research run" flow used by both the home hero form and the
 * sidebar search. Handles the signed-in vs anonymous paths, the active-research
 * sessionStorage bridge, and navigation to the ticker route.
 */
export function useStartResearch() {
  const router = useRouter()
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth()
  const { isAuthenticated } = useConvexAuth()
  const requestAuthenticatedRun = useAction(
    api.researchActions.requestAuthenticatedRun
  )

  async function startResearch(rawSymbol: string): Promise<StartResearchResult> {
    const normalizedSymbol = rawSymbol.trim().toUpperCase()

    if (!normalizedSymbol) {
      return { status: "error", message: "Enter a ticker symbol" }
    }
    if (!clerkLoaded) {
      return {
        status: "error",
        message: "Checking your session. Try again in a moment.",
      }
    }
    if (isSignedIn && !isAuthenticated) {
      return {
        status: "error",
        message: "Connecting your account. Try again in a moment.",
      }
    }

    try {
      if (isSignedIn) {
        const result = await requestAuthenticatedRun({
          symbol: normalizedSymbol,
          now: Number(new Date()),
        })
        writeActiveResearchSession(normalizedSymbol, { runId: result.runId })
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

      return { status: "ok" }
    } catch (error) {
      const text = getConvexMutationUserMessage(error, "Unable to start research")
      const message =
        clerkLoaded &&
        isSignedIn &&
        (text === "Not authenticated" ||
          text.toLowerCase().includes("unauthenticated"))
          ? `${text} If this persists, add a Clerk JWT template named "convex" and set CLERK_JWT_ISSUER_DOMAIN in Convex.`
          : text
      return { status: "error", message }
    }
  }

  return { startResearch, clerkLoaded }
}
