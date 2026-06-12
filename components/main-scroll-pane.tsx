import type { ReactNode } from "react"

/**
 * The single scroll container for page content. It is always a scroller:
 * when content fits there is nothing to scroll (and no rubber banding,
 * since the root has `overscroll-behavior-y: none`), and when content
 * overflows it scrolls normally. `overscroll-y-none` stops scroll
 * chaining to the viewport at the edges.
 */
export function MainScrollPane({ children }: { children: ReactNode }) {
  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto overscroll-y-none">
      <div className="h-full min-h-full">{children}</div>
    </div>
  )
}
