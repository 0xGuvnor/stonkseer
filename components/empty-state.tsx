import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { MOBILE_CENTER_PAGE_SHELL } from "@/lib/research-route-layout"
import { cn } from "@/lib/utils"

export type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description: string
  eyebrow?: string
  cta?: { label: string; href: string }
  actions?: ReactNode
  /** When false, render content only (no viewport-centering shell). */
  shell?: boolean
  descriptionClassName?: string
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  eyebrow,
  cta,
  actions,
  shell = true,
  descriptionClassName,
  className,
}: EmptyStateProps) {
  const content = (
    <>
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
      <p
        className={cn(
          "mt-3 max-w-lg text-pretty text-muted-foreground",
          descriptionClassName,
        )}
      >
        {description}
      </p>

      {cta ? (
        <Button
          asChild
          className="bg-gradient-brand mt-7 text-primary-foreground shadow-sm transition-transform hover:scale-[1.02] hover:brightness-105"
        >
          <Link href={cta.href}>{cta.label}</Link>
        </Button>
      ) : null}

      {actions ? <div className="mt-7">{actions}</div> : null}
    </>
  )

  if (!shell) {
    return (
      <div
        className={cn(
          "flex w-full max-w-md flex-col items-center text-center",
          className,
        )}
      >
        {content}
      </div>
    )
  }

  return (
    <div
      className={cn(
        MOBILE_CENTER_PAGE_SHELL,
        "w-full max-w-md",
        className,
      )}
    >
      {content}
    </div>
  )
}
