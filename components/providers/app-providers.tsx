"use client"

import type { ReactNode } from "react"

import { AuthSync } from "./auth-sync"
import { ConvexClientProvider } from "./convex-client-provider"
import { ThemeProvider } from "./theme-provider"

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConvexClientProvider>
      <ThemeProvider>
        <AuthSync />
        {children}
      </ThemeProvider>
    </ConvexClientProvider>
  )
}
