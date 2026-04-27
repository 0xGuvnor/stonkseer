"use client"

import type { ReactNode } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

export function MainShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-h-svh bg-background">
        {/* Mobile-only: sidebar has no visible trigger without a top bar */}
        <div className="sticky top-0 z-40 flex h-11 items-center border-b bg-background px-3 md:hidden">
          <SidebarTrigger />
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
