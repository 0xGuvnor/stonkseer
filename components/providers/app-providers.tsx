"use client"

import type { ReactNode } from "react"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

import { AuthSync } from "./auth-sync"
import { ConvexClientProvider } from "./convex-client-provider"
import { ResearchCompletionNotifier } from "./research-completion-notifier"
import { ThemeProvider } from "./theme-provider"

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConvexClientProvider>
      <ThemeProvider>
        <TooltipProvider>
          <AuthSync />
          <ResearchCompletionNotifier />
          {children}
          <Toaster position="top-center" />
        </TooltipProvider>
      </ThemeProvider>
    </ConvexClientProvider>
  )
}
