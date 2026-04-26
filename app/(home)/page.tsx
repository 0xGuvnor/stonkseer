import Image from "next/image"
import Link from "next/link"

import { HomeAuthControls } from "./home-auth-controls"
import { HomeResearchClient } from "./home-research-client"

export default function Page() {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-6 px-6 py-5">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/"
            className="shrink-0 rounded-md ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <Image
              src="/logo-light.png"
              alt="Stonkseer"
              width={48}
              height={48}
              className="size-12 dark:hidden"
              priority
            />
            <Image
              src="/logo-dark.png"
              alt="Stonkseer"
              width={48}
              height={48}
              className="size-12 hidden dark:block"
              priority
            />
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground">
              StonkSeer
            </p>
            <h1 className="font-heading text-2xl leading-tight font-semibold">
              Track upcoming stock catalysts
            </h1>
          </div>
        </div>
        <HomeAuthControls />
      </header>

      <HomeResearchClient />
    </main>
  )
}
