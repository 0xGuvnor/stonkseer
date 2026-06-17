"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { type FormEvent, useEffect, useRef, useState } from "react"
import { Loader2, LogIn, Search } from "lucide-react"
import { Show, SignInButton, UserButton, useAuth, useUser } from "@clerk/nextjs"
import { useAction, useConvexAuth, useQuery } from "convex/react"
import { toast } from "sonner"

import {
  APP_NAV,
  FOCUS_HOME_SEARCH_EVENT,
  FOCUS_SIDEBAR_SEARCH_EVENT,
} from "@/lib/app-navigation"
import { showConvexMutationErrorToast } from "@/lib/convex-mutation-error"
import { writeActiveResearchSession } from "@/lib/research-run-session-storage"
import { useStartResearch } from "@/hooks/use-start-research"
import { api } from "@/convex/_generated/api"
import { cn } from "@/lib/utils"
import { CmdKHint } from "@/components/cmd-k-hint"
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

const NAV_ITEM_CLASSES = cn(
  "relative rounded-md transition-colors",
  "data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground",
  "data-[active=true]:before:absolute data-[active=true]:before:top-1/2 data-[active=true]:before:left-1 data-[active=true]:before:h-5 data-[active=true]:before:w-0.5 data-[active=true]:before:-translate-y-1/2 data-[active=true]:before:rounded-full data-[active=true]:before:bg-primary"
)

export function AppSidebar() {
  const pathname = usePathname()
  const { user } = useUser()
  const { state, isMobile, open, setOpen, setOpenMobile } = useSidebar()
  const displayName =
    user?.fullName ?? user?.firstName ?? user?.username ?? "Account"
  // Icon mode = collapsed desktop (not the mobile Sheet state)
  const isIconMode = state === "collapsed" && !isMobile
  const isHome = pathname === "/"

  function closeMobileSidebar() {
    if (isMobile) setOpenMobile(false)
  }

  // Global Cmd+K: focus the home hero search on `/`, otherwise expand the
  // sidebar and focus its search input.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() !== "k") return
      event.preventDefault()

      if (isHome) {
        window.dispatchEvent(new Event(FOCUS_HOME_SEARCH_EVENT))
        return
      }

      if (isMobile) {
        setOpenMobile(true)
      } else if (!open) {
        setOpen(true)
      }
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event(FOCUS_SIDEBAR_SEARCH_EVENT))
      })
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isHome, isMobile, open, setOpen, setOpenMobile])

  return (
    <Sidebar collapsible="icon" variant="sidebar">
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
              className="absolute inset-0 size-full rounded-lg bg-sidebar opacity-0 pointer-events-none transition-opacity duration-150 group-hover/logozone:pointer-events-auto group-hover/logozone:opacity-100 hover:bg-sidebar-accent"
            />
          </div>
        ) : (
          // Expanded (or mobile Sheet): logo + wordmark + trigger
          <div className="flex w-full items-center justify-between gap-2">
            <Link
              href="/"
              onClick={closeMobileSidebar}
              className="flex min-w-0 items-center gap-2.5 rounded-lg px-1 ring-sidebar-ring transition-opacity outline-none hover:opacity-90 focus-visible:ring-2"
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
              <span className="truncate font-mono text-sm font-semibold tracking-tight text-sidebar-foreground">
                Stonk<span className="text-primary">Seer</span>
              </span>
            </Link>
            <SidebarTrigger className="shrink-0" />
          </div>
        )}
      </SidebarHeader>

      {/* ── Search ─────────────────────────────────────────── */}
      <SidebarContent>
        <SidebarGroup className={cn(isIconMode ? "px-1 pb-1" : "px-2 pb-1")}>
          <SidebarGroupContent>
            <SidebarSearch
              isHome={isHome}
              isIconMode={isIconMode}
              onNavigate={closeMobileSidebar}
            />
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ── Nav ──────────────────────────────────────────── */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {APP_NAV.map(({ href, label, icon: Icon }) => {
                const isActive =
                  pathname === href || pathname.startsWith(`${href}/`)

                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={label}
                      className={NAV_ITEM_CLASSES}
                    >
                      <Link href={href} onClick={closeMobileSidebar}>
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

        {/* ── Recent searches ──────────────────────────────── */}
        {!isIconMode ? (
          <RecentSearches onNavigate={closeMobileSidebar} />
        ) : null}
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
                <SidebarMenuButton
                  tooltip="Sign in"
                  className="rounded-lg"
                  onClick={closeMobileSidebar}
                >
                  <LogIn />
                  <span>Sign in</span>
                </SidebarMenuButton>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <div
                className={cn(
                  "flex items-center rounded-lg px-3 py-2 text-sm text-sidebar-foreground",
                  isIconMode ? "justify-center" : "gap-3"
                )}
              >
                <UserButton
                  appearance={{
                    elements: { avatarBox: "size-5" },
                  }}
                />
                {!isIconMode && (
                  <span className="truncate font-medium">{displayName}</span>
                )}
              </div>
            </Show>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

function SidebarSearch({
  isHome,
  isIconMode,
  onNavigate,
}: {
  isHome: boolean
  isIconMode: boolean
  onNavigate: () => void
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const { startResearch } = useStartResearch()

  // On non-home routes, let Cmd+K focus this input.
  useEffect(() => {
    if (isHome || isIconMode) return
    function focusInput() {
      inputRef.current?.focus()
    }
    window.addEventListener(FOCUS_SIDEBAR_SEARCH_EVENT, focusInput)
    return () =>
      window.removeEventListener(FOCUS_SIDEBAR_SEARCH_EVENT, focusInput)
  }, [isHome, isIconMode])

  function focusHomeSearch() {
    onNavigate()
    router.push("/")
    // If we're already on `/`, the input won't remount, so ask it to focus.
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event(FOCUS_HOME_SEARCH_EVENT))
    })
  }

  // Collapsed desktop: compact icon button (no room for label/input)
  if (isIconMode) {
    return (
      <SidebarMenuButton
        tooltip="Search"
        aria-label="Search a ticker"
        className="cursor-pointer rounded-md"
        onClick={focusHomeSearch}
      >
        <Search />
        <span>Search</span>
      </SidebarMenuButton>
    )
  }

  // Home: a button that focuses the big hero search
  if (isHome) {
    return (
      <button
        type="button"
        onClick={focusHomeSearch}
        className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-sidebar-border bg-background/40 px-3 py-2 text-sidebar-foreground/70 transition-colors hover:border-primary/40 hover:text-sidebar-foreground"
      >
        <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-left text-sm">Search</span>
        <CmdKHint className="border-sidebar-border bg-sidebar" />
      </button>
    )
  }

  // Other routes: a real input to type a ticker and start research
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const symbol = value.trim().toUpperCase()
    if (!symbol || submitting) return

    setSubmitting(true)
    onNavigate()
    const result = await startResearch(symbol)
    setSubmitting(false)

    if (result.status === "error") {
      toast.error(result.message)
    } else {
      setValue("")
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-background/40 px-3 py-2 transition-colors focus-within:border-primary/40"
    >
      <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label="Search a ticker"
        autoComplete="off"
        maxLength={10}
        placeholder="Search a ticker"
        className="min-w-0 flex-1 bg-transparent font-mono text-sm text-sidebar-foreground uppercase outline-none placeholder:normal-case placeholder:text-muted-foreground/60"
      />
      {submitting ? (
        <Loader2 aria-hidden className="size-3.5 animate-spin text-muted-foreground" />
      ) : (
        <CmdKHint className="border-sidebar-border bg-sidebar" />
      )}
    </form>
  )
}

function RecentSearches({ onNavigate }: { onNavigate: () => void }) {
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const { isAuthenticated } = useConvexAuth()
  const requestAuthenticatedRun = useAction(
    api.researchActions.requestAuthenticatedRun
  )
  const recent = useQuery(
    api.research.listRecentSearches,
    isAuthenticated ? {} : "skip"
  )

  if (!isSignedIn || !recent || recent.length === 0) {
    return null
  }

  async function openRecentSearch(symbol: string) {
    onNavigate()
    try {
      const result = await requestAuthenticatedRun({
        symbol,
        now: Number(new Date()),
      })
      writeActiveResearchSession(symbol, { runId: result.runId })
      router.push(`/${symbol}`)
    } catch (error) {
      showConvexMutationErrorToast(error, "Unable to open that ticker")
    }
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="font-mono text-[10px] tracking-widest text-muted-foreground/70 uppercase">
        Recent
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {recent.map(({ symbol }) => (
            <SidebarMenuItem key={symbol}>
              <SidebarMenuButton
                className="cursor-pointer rounded-md font-mono text-xs font-medium tracking-tight"
                onClick={() => void openRecentSearch(symbol)}
              >
                <span className="truncate">{symbol}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
