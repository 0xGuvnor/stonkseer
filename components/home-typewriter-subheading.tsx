"use client"

import { useEffect, useState } from "react"

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"

const PHRASES = ["Earnings", "Launches", "Regulatory events"] as const

const STATIC_SUFFIX = "that could move a stock over the next 12 months."

const STATIC_SENTENCE =
  "Earnings, launches, and regulatory events that could move a stock over the next 12 months."

const SUBHEADING_SHELL_CLASS =
  "mt-4 flex h-[3lh] w-full max-w-md items-center justify-center text-center text-sm leading-relaxed sm:h-[2.5lh]"

const TYPE_MS = 60
const DELETE_MS = 40
const PAUSE_MS = 1500

function useTypewriterCycle(
  phrases: readonly string[],
  options: { typeMs: number; deleteMs: number; pauseMs: number }
) {
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [displayText, setDisplayText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const currentPhrase = phrases[phraseIndex]
    if (!currentPhrase) return

    let timeoutId: ReturnType<typeof setTimeout>

    if (!isDeleting && displayText === currentPhrase) {
      timeoutId = setTimeout(() => setIsDeleting(true), options.pauseMs)
    } else if (isDeleting && displayText === "") {
      timeoutId = setTimeout(() => {
        setIsDeleting(false)
        setPhraseIndex((index) => (index + 1) % phrases.length)
      }, options.typeMs)
    } else if (isDeleting) {
      timeoutId = setTimeout(() => {
        setDisplayText((text) => text.slice(0, -1))
      }, options.deleteMs)
    } else {
      timeoutId = setTimeout(() => {
        setDisplayText(currentPhrase.slice(0, displayText.length + 1))
      }, options.typeMs)
    }

    return () => clearTimeout(timeoutId)
  }, [
    displayText,
    isDeleting,
    options.deleteMs,
    options.pauseMs,
    options.typeMs,
    phraseIndex,
    phrases,
  ])

  return displayText
}

function StaticSubheading() {
  return (
    <div className={SUBHEADING_SHELL_CLASS}>
      <p className="w-full text-pretty text-muted-foreground">
        {STATIC_SENTENCE}
      </p>
    </div>
  )
}

function AnimatedSubheading() {
  const displayText = useTypewriterCycle(PHRASES, {
    typeMs: TYPE_MS,
    deleteMs: DELETE_MS,
    pauseMs: PAUSE_MS,
  })

  return (
    <div className={SUBHEADING_SHELL_CLASS}>
      <span className="sr-only">{STATIC_SENTENCE}</span>
      <p aria-hidden className="w-full text-pretty text-muted-foreground">
        <span className="font-medium text-primary">{displayText}</span>
        <span
          aria-hidden
          className="animate-typewriter-cursor -ml-1 inline-block font-mono text-primary"
        >
          |
        </span>
        {STATIC_SUFFIX}
      </p>
    </div>
  )
}

export function HomeTypewriterSubheading() {
  const prefersReducedMotion = usePrefersReducedMotion()

  if (prefersReducedMotion) {
    return <StaticSubheading />
  }

  return <AnimatedSubheading />
}
