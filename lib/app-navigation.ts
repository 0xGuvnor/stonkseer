import { Briefcase, type LucideIcon } from "lucide-react"

export const APP_NAV = [
  { href: "/portfolios", label: "Portfolios", icon: Briefcase },
] as const satisfies ReadonlyArray<{
  href: string
  label: string
  icon: LucideIcon
}>

/**
 * Dispatched on `window` to ask the home page to focus its ticker search input.
 * Lets the sidebar search trigger / Cmd+K focus the field when already on `/`.
 */
export const FOCUS_HOME_SEARCH_EVENT = "stonkseer:focus-search"

/**
 * Dispatched on `window` to ask the sidebar search input (shown on non-home
 * routes) to focus itself, e.g. when Cmd+K is pressed away from home.
 */
export const FOCUS_SIDEBAR_SEARCH_EVENT = "stonkseer:focus-sidebar-search"

const RESERVED_PATHS = new Set(["portfolios"])

export function isTickerResearchPath(pathname: string): boolean {
  return (
    pathname.length > 1 &&
    pathname !== "/portfolios" &&
    !pathname.startsWith("/portfolios/")
  )
}

export function getMobileHeaderTitle(pathname: string): string {
  if (pathname === "/") {
    return "Search"
  }

  if (pathname === "/portfolios" || pathname.startsWith("/portfolios/")) {
    return "Portfolios"
  }

  const topSegment = pathname.slice(1).split("/")[0]
  if (topSegment && !RESERVED_PATHS.has(topSegment)) {
    return topSegment.toUpperCase()
  }

  return "Search"
}
