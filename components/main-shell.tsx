"use client"

import type { ReactNode } from "react"

import { AppBackground } from "@/components/app-background"
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
      <SidebarInset className="relative min-h-0 md:peer-data-[variant=inset]:glow-brand">
        <AppBackground className="md:rounded-2xl" />
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          {/* Mobile-only: blurred, borderless top bar with the sidebar trigger */}
          <div className="glass sticky top-0 z-40 flex h-12 items-center px-3 md:hidden">
            <SidebarTrigger />
          </div>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
