import { ConvexError } from "convex/values"
import { toast } from "sonner"

export function getConvexMutationUserMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data
  }

  if (error instanceof Error) {
    const uncaught = error.message.match(/Uncaught Error: (.+?)(?:\s+at\s|\n|$)/)
    if (uncaught?.[1]) {
      return uncaught[1]
    }

    if (!error.message.startsWith("[CONVEX")) {
      return error.message
    }
  }

  return fallback
}

export function showConvexMutationErrorToast(error: unknown, fallback: string) {
  toast.error(getConvexMutationUserMessage(error, fallback))
}
