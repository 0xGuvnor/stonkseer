"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import { Switch } from "@/components/ui/switch"
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const { state, isMobile } = useSidebar()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = resolvedTheme === "dark"
  const isIconMode = state === "collapsed" && !isMobile

  if (isIconMode) {
    return (
      <SidebarMenuButton
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={
          mounted
            ? isDark
              ? "Switch to light mode"
              : "Switch to dark mode"
            : "Toggle theme"
        }
        tooltip={mounted ? (isDark ? "Light mode" : "Dark mode") : "Theme"}
      >
        {mounted ? isDark ? <Sun /> : <Moon /> : <Sun />}
        <span>{mounted ? (isDark ? "Light mode" : "Dark mode") : "Theme"}</span>
      </SidebarMenuButton>
    )
  }

  // Expanded (or mobile sheet): icon + label + Switch
  return (
    <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-sidebar-foreground">
      {mounted ? (
        isDark ? (
          <Sun className="size-4 shrink-0" />
        ) : (
          <Moon className="size-4 shrink-0" />
        )
      ) : (
        <Sun className="size-4 shrink-0" />
      )}
      <span className="flex-1 truncate">Dark mode</span>
      <Switch
        checked={mounted ? isDark : false}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        aria-label="Toggle dark mode"
      />
    </div>
  )
}
