import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const getSnapshot = React.useCallback(() => {
    return window.innerWidth < MOBILE_BREAKPOINT
  }, [])

  const subscribe = React.useCallback((onStoreChange: () => void) => {
    const handler = () => {
      onStoreChange()
    }
    window.addEventListener("resize", handler)
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    mql.addEventListener("change", handler)
    return () => {
      window.removeEventListener("resize", handler)
      mql.removeEventListener("change", handler)
    }
  }, [])

  return React.useSyncExternalStore(subscribe, getSnapshot, () => false)
}
