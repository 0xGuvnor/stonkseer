"use client"

import type { ReactNode } from "react"

import { TooltipProvider } from "@/components/ui/tooltip"

import { AuthSync } from "./auth-sync"
import { ConvexClientProvider } from "./convex-client-provider"
import { ThemeProvider } from "./theme-provider"

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConvexClientProvider>
      <ThemeProvider>
        <TooltipProvider>
          <AuthSync />
          {children}
        </TooltipProvider>
      </ThemeProvider>
    </ConvexClientProvider>
  )
}
