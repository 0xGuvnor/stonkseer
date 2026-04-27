"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Briefcase, Calendar, LogIn, Search } from "lucide-react"
import { Show, SignInButton, UserButton } from "@clerk/nextjs"

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
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"

const NAV = [
  { href: "/", label: "Search", icon: Search },
  { href: "/portfolios", label: "Portfolios", icon: Briefcase },
  { href: "/calendar", label: "Calendar", icon: Calendar },
] as const

export function AppSidebar() {
  const pathname = usePathname()
  const { state, isMobile } = useSidebar()
  // Icon mode = collapsed desktop (not the mobile Sheet state)
  const isIconMode = state === "collapsed" && !isMobile

  return (
    <Sidebar collapsible="icon">
      {/* ── Header ─────────────────────────────────────────── */}
      <SidebarHeader
        className={cn(
          "border-b border-sidebar-border",
          isIconMode ? "px-1 py-3" : "px-3 py-4"
        )}
      >
        {isIconMode ? (
          // Collapsed desktop: logo centred, trigger overlaid and revealed on hover
          <div className="group/logozone relative flex items-center justify-center">
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
            {/* Covers the whole logo; invisible until hover.
                bg-sidebar gives it a solid background so the logo
                doesn't show through during the fade (eliminates the
                jarring double-animation from the ghost button hover). */}
            <SidebarTrigger
              aria-label="Expand sidebar"
              className="absolute inset-0 size-full rounded-xl bg-sidebar opacity-0 transition-opacity duration-150 group-hover/logozone:opacity-100 hover:bg-sidebar-accent"
            />
          </div>
        ) : (
          // Expanded (or mobile Sheet): logo + wordmark + trigger
          <div className="flex w-full items-center justify-between gap-2">
            <Link
              href="/"
              className="flex min-w-0 items-center gap-3 rounded-xl px-1 ring-sidebar-ring transition-opacity outline-none hover:opacity-90 focus-visible:ring-2"
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
              <span className="truncate font-semibold tracking-tight text-sidebar-foreground">
                StonkSeer
              </span>
            </Link>
            <SidebarTrigger className="shrink-0" />
          </div>
        )}
      </SidebarHeader>

      {/* ── Nav ────────────────────────────────────────────── */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[0.65rem] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map(({ href, label, icon: Icon }) => {
                const isActive =
                  href === "/"
                    ? pathname === "/"
                    : pathname === href || pathname.startsWith(`${href}/`)

                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={label}
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
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <ThemeToggle />
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator />

        <SidebarMenu>
          <SidebarMenuItem>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <SidebarMenuButton tooltip="Sign in">
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
                    elements: { avatarBox: "size-4" },
                  }}
                />
                {!isIconMode && <span className="truncate">Account</span>}
              </div>
            </Show>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
