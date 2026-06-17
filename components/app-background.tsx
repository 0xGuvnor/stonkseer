import { cn } from "@/lib/utils"

/**
 * Ambient canvas rendered behind page content on every route.
 * Per the "Quiet Terminal" spec, this is the only decoration allowed: a single
 * faint mint bloom at the top center (the only "glow" allowed), plus a
 * barely-there grid texture that gives a sense of deliberate surface rather
 * than void.
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
      {/* Single faint mint bloom at the top center */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 70% 50% at 50% -10%, oklch(0.82 0.16 165 / 0.08), transparent)",
        }}
      />
      {/* Barely-visible grid texture */}
      <div
        className="absolute inset-0 text-foreground opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
    </div>
  )
}
