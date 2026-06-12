"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Briefcase, Calendar, LogIn, Search } from "lucide-react"
import { Show, SignInButton, UserButton, useUser } from "@clerk/nextjs"

import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"

const NAV = [
  { href: "/", label: "Search", icon: Search },
  { href: "/portfolios", label: "Portfolios", icon: Briefcase },
  { href: "/calendar", label: "Calendar", icon: Calendar },
] as const

const NAV_ITEM_CLASSES = cn(
  "relative rounded-xl transition-colors",
  "data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground",
  "data-[active=true]:before:absolute data-[active=true]:before:top-1/2 data-[active=true]:before:left-1 data-[active=true]:before:h-5 data-[active=true]:before:w-1 data-[active=true]:before:-translate-y-1/2 data-[active=true]:before:rounded-full data-[active=true]:before:bg-gradient-brand"
)

export function AppSidebar() {
  const pathname = usePathname()
  const { user } = useUser()
  const { state, isMobile } = useSidebar()
  const displayName =
    user?.fullName ?? user?.firstName ?? user?.username ?? "Account"
  // Icon mode = collapsed desktop (not the mobile Sheet state)
  const isIconMode = state === "collapsed" && !isMobile

  return (
    <Sidebar collapsible="icon" variant="inset">
      {/* ── Header ─────────────────────────────────────────── */}
      <SidebarHeader className={cn(isIconMode ? "px-1 py-3" : "px-2 py-4")}>
        {isIconMode ? (
          // Collapsed desktop: logo by default, expand icon on hover (no overlap)
          <div className="group/logozone relative flex items-center justify-center">
            <span className="transition-opacity duration-150 group-hover/logozone:opacity-0">
              <Image
                src="/logo-light.png"
                alt=""
                aria-hidden
                width={40}
                height={40}
                className="size-10 shrink-0 dark:hidden"
              />
              <Image
                src="/logo-dark.png"
                alt=""
                aria-hidden
                width={40}
                height={40}
                className="hidden size-10 shrink-0 dark:block"
              />
            </span>
            <SidebarTrigger
              aria-label="Expand sidebar"
              className="absolute inset-0 size-full rounded-xl bg-sidebar opacity-0 pointer-events-none transition-opacity duration-150 group-hover/logozone:pointer-events-auto group-hover/logozone:opacity-100 hover:bg-sidebar-accent"
            />
          </div>
        ) : (
          // Expanded (or mobile Sheet): logo + wordmark + trigger
          <div className="flex w-full items-center justify-between gap-2">
            <Link
              href="/"
              className="flex min-w-0 items-center gap-2.5 rounded-xl px-1 ring-sidebar-ring transition-opacity outline-none hover:opacity-90 focus-visible:ring-2"
            >
              <Image
                src="/logo-light.png"
                alt="StonkSeer"
                width={40}
                height={40}
                className="size-10 shrink-0 dark:hidden"
              />
              <Image
                src="/logo-dark.png"
                alt="StonkSeer"
                width={40}
                height={40}
                className="hidden size-10 shrink-0 dark:block"
              />
              <span className="truncate text-base font-semibold tracking-tight text-sidebar-foreground">
                Stonk<span className="text-gradient-brand">Seer</span>
              </span>
            </Link>
            <SidebarTrigger className="shrink-0" />
          </div>
        )}
      </SidebarHeader>

      {/* ── Nav ────────────────────────────────────────────── */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[0.65rem] font-semibold tracking-[0.2em] text-sidebar-foreground/55 uppercase">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {NAV.map(({ href, label, icon: Icon }) => {
                const isTickerResearchPath =
                  pathname.length > 1 &&
                  pathname !== "/portfolios" &&
                  !pathname.startsWith("/portfolios/") &&
                  pathname !== "/calendar" &&
                  !pathname.startsWith("/calendar/")
                const isActive =
                  href === "/"
                    ? pathname === "/" || isTickerResearchPath
                    : pathname === href || pathname.startsWith(`${href}/`)

                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={label}
                      className={NAV_ITEM_CLASSES}
                    >
                      <Link href={href}>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Footer: theme then auth ─────────────────────────── */}
      <SidebarFooter className="gap-1.5">
        <SidebarMenu>
          <SidebarMenuItem>
            <ThemeToggle />
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarMenu>
          <SidebarMenuItem>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <SidebarMenuButton tooltip="Sign in" className="rounded-xl">
                  <LogIn />
                  <span>Sign in</span>
                </SidebarMenuButton>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <div
                className={cn(
                  "flex items-center rounded-xl px-3 py-2 text-sm text-sidebar-foreground",
                  isIconMode ? "justify-center" : "gap-3"
                )}
              >
                <UserButton
                  appearance={{
                    elements: { avatarBox: "size-5" },
                  }}
                />
                {!isIconMode && (
                  <span className="truncate">{displayName}</span>
                )}
              </div>
            </Show>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
