"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"

import { AppBackground } from "@/components/app-background"
import { AppSidebar } from "@/components/app-sidebar"
import { MainScrollPane } from "@/components/main-scroll-pane"
import { TickerTape } from "@/components/ticker-tape"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  getMobileHeaderTitle,
  isTickerResearchPath,
} from "@/lib/app-navigation"
import { cn } from "@/lib/utils"

export function MainShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <SidebarProvider className="h-svh min-h-0 overflow-hidden">
      <AppSidebar />
      <SidebarInset className="relative min-h-0 overflow-hidden">
        <AppBackground />
        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Mobile-only: matches ticker tape surface */}
          <div className="z-40 flex h-12 shrink-0 items-center gap-2 bg-background px-3 md:hidden">
            <SidebarTrigger />
            <p
              className={cn(
                "truncate text-sm font-semibold tracking-tight text-foreground",
                isTickerResearchPath(pathname) && "font-mono uppercase"
              )}
            >
              {getMobileHeaderTitle(pathname)}
            </p>
          </div>
          <MainScrollPane>{children}</MainScrollPane>
          <TickerTape />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
