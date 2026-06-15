"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"

import { AppBackground } from "@/components/app-background"
import { AppSidebar } from "@/components/app-sidebar"
import { MainScrollPane } from "@/components/main-scroll-pane"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { getMobileHeaderTitle } from "@/lib/app-navigation"

export function MainShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <SidebarProvider className="h-svh min-h-0 overflow-hidden">
      <AppSidebar />
      <SidebarInset className="relative min-h-0 overflow-hidden md:peer-data-[variant=inset]:glow-brand">
        <AppBackground className="md:rounded-2xl" />
        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Mobile-only: blurred, borderless top bar with the sidebar trigger */}
          <div className="glass z-40 flex h-12 shrink-0 items-center gap-2 px-3 md:hidden">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-5 self-center" />
            <p className="truncate text-sm font-semibold tracking-tight text-foreground">
              {getMobileHeaderTitle(pathname)}
            </p>
          </div>
          <MainScrollPane>{children}</MainScrollPane>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
