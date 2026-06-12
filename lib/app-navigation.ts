import { Briefcase, Calendar, Search, type LucideIcon } from "lucide-react"

export const APP_NAV = [
  { href: "/", label: "Search", icon: Search },
  { href: "/portfolios", label: "Portfolios", icon: Briefcase },
  { href: "/calendar", label: "Calendar", icon: Calendar },
] as const satisfies ReadonlyArray<{
  href: string
  label: string
  icon: LucideIcon
}>

const RESERVED_PATHS = new Set(["portfolios", "calendar"])

export function isTickerResearchPath(pathname: string): boolean {
  return (
    pathname.length > 1 &&
    pathname !== "/portfolios" &&
    !pathname.startsWith("/portfolios/") &&
    pathname !== "/calendar" &&
    !pathname.startsWith("/calendar/")
  )
}

export function getMobileHeaderTitle(pathname: string): string {
  if (pathname === "/") {
    return "Search"
  }

  if (pathname === "/portfolios" || pathname.startsWith("/portfolios/")) {
    return "Portfolios"
  }

  if (pathname === "/calendar" || pathname.startsWith("/calendar/")) {
    return "Calendar"
  }

  const topSegment = pathname.slice(1).split("/")[0]
  if (topSegment && !RESERVED_PATHS.has(topSegment)) {
    return topSegment.toUpperCase()
  }

  return "Search"
}
