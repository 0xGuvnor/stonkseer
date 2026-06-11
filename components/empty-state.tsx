import Link from "next/link"
import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description: string
  eyebrow?: string
  cta?: { label: string; href: string }
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  eyebrow,
  cta,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-[calc(100svh-3rem)] w-full max-w-md flex-col items-center justify-center px-5 text-center md:min-h-full",
        className
      )}
    >
      {/* Glowing brand icon chip */}
      <div className="relative mb-6">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 scale-150 rounded-full opacity-70 blur-2xl"
          style={{
            background:
              "radial-gradient(closest-side, var(--glow-primary), transparent)",
          }}
        />
        <div className="bg-gradient-brand glow-brand flex size-16 items-center justify-center rounded-2xl text-primary-foreground">
          <Icon className="size-7" aria-hidden />
        </div>
      </div>

      {eyebrow ? (
        <span className="mb-2 text-[0.65rem] font-semibold tracking-[0.2em] text-primary uppercase">
          {eyebrow}
        </span>
      ) : null}
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        {title}
      </h1>
      <p className="mt-3 text-pretty text-muted-foreground">{description}</p>

      {cta ? (
        <Button
          asChild
          className="bg-gradient-brand mt-7 text-primary-foreground shadow-sm transition-transform hover:scale-[1.02] hover:brightness-105"
        >
          <Link href={cta.href}>{cta.label}</Link>
        </Button>
      ) : null}
    </div>
  )
}
