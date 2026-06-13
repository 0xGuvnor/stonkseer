import { Suspense } from "react"
import { Loader2 } from "lucide-react"

import { PortfoliosClient } from "./portfolios-client"

function PortfoliosLoading() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl items-center gap-2 px-4 py-6 text-sm text-muted-foreground sm:px-6 sm:py-8">
      <Loader2 className="size-4 animate-spin" />
      Loading portfolios…
    </div>
  )
}

export default function PortfoliosPage() {
  return (
    <Suspense fallback={<PortfoliosLoading />}>
      <PortfoliosClient />
    </Suspense>
  )
}
