import { cn } from "@/lib/utils"

/**
 * The ⌘K shortcut hint. The command glyph is intentionally larger than the
 * letter with a small gap between them for legibility.
 */
export function CmdKHint({ className }: { className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-muted-foreground",
        className
      )}
    >
      <span className="text-sm leading-none">⌘</span>
      <span className="text-[11px] leading-none">K</span>
    </kbd>
  )
}
