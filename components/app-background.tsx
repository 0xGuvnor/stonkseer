import { cn } from "@/lib/utils"

/**
 * Ambient atmosphere layer rendered behind page content inside the inset panel.
 * Soft brand-tinted radial glows give depth without any hard borders.
 */
export function AppBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
    >
      {/* Top centered emerald bloom */}
      <div
        className="absolute -top-40 left-1/2 h-[520px] w-[min(900px,120%)] -translate-x-1/2 rounded-full opacity-80 blur-2xl"
        style={{
          background:
            "radial-gradient(closest-side, var(--glow-primary), transparent)",
        }}
      />
      {/* Right teal accent */}
      <div
        className="absolute top-1/4 -right-32 h-[460px] w-[460px] rounded-full opacity-70 blur-2xl"
        style={{
          background:
            "radial-gradient(closest-side, var(--glow-secondary), transparent)",
        }}
      />
      {/* Lower-left cool wash */}
      <div
        className="absolute -bottom-40 -left-24 h-[420px] w-[420px] rounded-full opacity-60 blur-2xl"
        style={{
          background:
            "radial-gradient(closest-side, var(--glow-secondary), transparent)",
        }}
      />
    </div>
  )
}
