"use client"

import { Show, SignInButton, useAuth } from "@clerk/nextjs"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { Briefcase, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { EmptyState } from "@/components/empty-state"
import { CatalystEventsTable } from "@/components/research/catalyst-events-table"
import { PortfolioHoldingsTable } from "@/components/portfolios/portfolio-holdings-table"
import { PortfolioToolbar } from "@/components/portfolios/portfolio-toolbar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { daysUntilAnchor } from "@/lib/portfolio-catalyst-utils"
import {
  readLastPortfolioId,
  resolveSelectedPortfolioId,
  writeLastPortfolioId,
} from "@/lib/portfolio-selection"
import { RESEARCH_ROUTE_CENTER_SHELL } from "@/lib/research-route-layout"
import type { PortfolioCatalystEventView, PortfolioPageDataView } from "@/types/research-ui"

const PAGE_SHELL = "mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8"

export function PortfoliosClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [now] = useState(() => Date.now())
  const [explicitPortfolioId, setExplicitPortfolioId] =
    useState<Id<"portfolios"> | null>(null)

  const { isLoaded: clerkLoaded, isSignedIn } = useAuth()
  const { isAuthenticated } = useConvexAuth()
  const me = useQuery(api.users.current, isAuthenticated ? {} : "skip")

  const portfolios = useQuery(
    api.portfolios.listMine,
    isAuthenticated && me ? {} : "skip",
  )

  const createPortfolio = useMutation(api.portfolios.create)
  const renamePortfolio = useMutation(api.portfolios.rename)
  const deletePortfolio = useMutation(api.portfolios.remove)
  const removeStock = useMutation(api.portfolios.removeStock)

  const urlPortfolioId = searchParams.get("portfolio")

  const selectedPortfolioId = useMemo(() => {
    if (!portfolios?.length) {
      return null
    }

    if (
      explicitPortfolioId &&
      portfolios.some((portfolio) => portfolio._id === explicitPortfolioId)
    ) {
      return explicitPortfolioId
    }

    return resolveSelectedPortfolioId(
      portfolios,
      urlPortfolioId,
      readLastPortfolioId(),
    )
  }, [portfolios, explicitPortfolioId, urlPortfolioId])

  const pageData = useQuery(
    api.portfolios.getPortfolioPageData,
    isAuthenticated && selectedPortfolioId
      ? { portfolioId: selectedPortfolioId, now }
      : "skip",
  )

  useEffect(() => {
    if (!selectedPortfolioId) {
      return
    }

    writeLastPortfolioId(selectedPortfolioId)

    if (urlPortfolioId !== selectedPortfolioId) {
      router.replace(`/portfolios?portfolio=${selectedPortfolioId}`, {
        scroll: false,
      })
    }
  }, [selectedPortfolioId, urlPortfolioId, router])

  function selectPortfolio(portfolioId: Id<"portfolios">) {
    setExplicitPortfolioId(portfolioId)
    writeLastPortfolioId(portfolioId)
    router.replace(`/portfolios?portfolio=${portfolioId}`, { scroll: false })
  }

  async function handleCreatePortfolio(name: string) {
    const portfolioId = await createPortfolio({ name })
    selectPortfolio(portfolioId)
    return portfolioId
  }

  async function handleRenamePortfolio(
    portfolioId: Id<"portfolios">,
    name: string,
  ) {
    await renamePortfolio({ portfolioId, name })
  }

  async function handleDeletePortfolio(portfolioId: Id<"portfolios">) {
    await deletePortfolio({ portfolioId })
    const remaining = (portfolios ?? []).filter(
      (portfolio) => portfolio._id !== portfolioId,
    )
    const next = resolveSelectedPortfolioId(remaining, null, null)
    setExplicitPortfolioId(next)
    if (next) {
      router.replace(`/portfolios?portfolio=${next}`, { scroll: false })
    } else {
      router.replace("/portfolios", { scroll: false })
    }
  }

  const portfolioList = (portfolios ?? []).map((portfolio) => ({
    _id: portfolio._id,
    name: portfolio.name,
  }))

  const summary = buildPortfolioSummary(pageData?.holdings ?? [], pageData?.catalysts ?? [], now)

  return (
    <Show
      when="signed-out"
      fallback={
        <SignedInPortfolios
          clerkLoaded={clerkLoaded}
          isSignedIn={Boolean(isSignedIn)}
          isAuthenticated={isAuthenticated}
          me={me}
          portfolios={portfolioList}
          portfoliosLoading={portfolios === undefined}
          selectedPortfolioId={selectedPortfolioId}
          pageData={pageData}
          summary={summary}
          now={now}
          onSelectPortfolio={selectPortfolio}
          onCreatePortfolio={handleCreatePortfolio}
          onRenamePortfolio={handleRenamePortfolio}
          onDeletePortfolio={handleDeletePortfolio}
          onRemoveStock={async (portfolioStockId) => {
            await removeStock({ portfolioStockId })
          }}
        />
      }
    >
      <section className={RESEARCH_ROUTE_CENTER_SHELL}>
        <EmptyState
          shell={false}
          icon={Briefcase}
          title="Sign in to use portfolios"
          description="Save catalyst research from any ticker and organize tracked events into portfolios. Sign in with Google to get started."
          actions={
            <div className="flex flex-col items-center gap-2">
              <SignInButton mode="modal">
                <Button className="bg-gradient-brand text-primary-foreground shadow-sm">
                  Sign in with Google
                </Button>
              </SignInButton>
              <Button asChild variant="link">
                <Link href="/">Research a ticker</Link>
              </Button>
            </div>
          }
        />
      </section>
    </Show>
  )
}

type SignedInPortfoliosProps = {
  clerkLoaded: boolean
  isSignedIn: boolean
  isAuthenticated: boolean
  me: unknown
  portfolios: Array<{ _id: Id<"portfolios">; name: string }>
  portfoliosLoading: boolean
  selectedPortfolioId: Id<"portfolios"> | null
  pageData: PortfolioPageDataView | undefined
  summary: string | null
  now: number
  onSelectPortfolio: (portfolioId: Id<"portfolios">) => void
  onCreatePortfolio: (name: string) => Promise<Id<"portfolios">>
  onRenamePortfolio: (
    portfolioId: Id<"portfolios">,
    name: string,
  ) => Promise<void>
  onDeletePortfolio: (portfolioId: Id<"portfolios">) => Promise<void>
  onRemoveStock: (portfolioStockId: Id<"portfolioStocks">) => Promise<void>
}

function SignedInPortfolios({
  clerkLoaded,
  isSignedIn,
  isAuthenticated,
  me,
  portfolios,
  portfoliosLoading,
  selectedPortfolioId,
  pageData,
  summary,
  now,
  onSelectPortfolio,
  onCreatePortfolio,
  onRenamePortfolio,
  onDeletePortfolio,
  onRemoveStock,
}: SignedInPortfoliosProps) {
  if (!clerkLoaded || (isSignedIn && (!isAuthenticated || me === undefined))) {
    return (
      <div className={PAGE_SHELL}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Connecting your account…
        </div>
      </div>
    )
  }

  if (portfoliosLoading) {
    return (
      <div className={PAGE_SHELL}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading portfolios…
        </div>
      </div>
    )
  }

  const autoOpenCreate = portfolios.length === 0

  return (
    <div className={PAGE_SHELL}>
      <header className="space-y-2">
        <h1 className="flex items-center gap-2.5 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          <span className="bg-gradient-brand flex size-9 shrink-0 items-center justify-center rounded-xl text-primary-foreground shadow-sm">
            <Briefcase className="size-4.5" aria-hidden />
          </span>
          Portfolios
        </h1>
        <p className="text-sm text-muted-foreground">
          Track saved catalyst research across the tickers you care about.
        </p>
      </header>

      <div className="mt-6 space-y-6">
        <PortfolioToolbar
          portfolios={portfolios}
          selectedPortfolioId={selectedPortfolioId}
          onSelectPortfolio={onSelectPortfolio}
          onCreatePortfolio={onCreatePortfolio}
          onRenamePortfolio={onRenamePortfolio}
          onDeletePortfolio={onDeletePortfolio}
          autoOpenCreate={autoOpenCreate}
        />

        {!selectedPortfolioId ? (
          <Alert className="glass border-0 ring-1 ring-border/60">
            <AlertDescription>
              Create your first portfolio, then save catalyst research from any
              ticker results page.
            </AlertDescription>
          </Alert>
        ) : pageData === undefined ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading portfolio…
          </div>
        ) : (
          <>
            {summary ? (
              <p className="text-sm text-muted-foreground">{summary}</p>
            ) : null}

            <Tabs defaultValue="holdings">
              <TabsList>
                <TabsTrigger value="holdings">Holdings</TabsTrigger>
                <TabsTrigger value="catalysts">Upcoming catalysts</TabsTrigger>
              </TabsList>

              <TabsContent value="holdings" className="mt-4">
                {pageData.holdings.length > 0 ? (
                  <PortfolioHoldingsTable
                    holdings={pageData.holdings}
                    now={now}
                    onRemoveStock={onRemoveStock}
                  />
                ) : (
                  <PortfolioEmptyHoldings />
                )}
              </TabsContent>

              <TabsContent value="catalysts" className="mt-4">
                {pageData.catalysts.length > 0 ? (
                  <CatalystEventsTable
                    events={pageData.catalysts}
                    showSymbolColumn
                    getSymbol={(event) =>
                      (event as PortfolioCatalystEventView).symbol
                    }
                  />
                ) : (
                  <div className="glass rounded-2xl p-8 text-center ring-1 ring-border/60">
                    <p className="text-sm text-muted-foreground">
                      No upcoming dated catalysts in this portfolio within the
                      next 12 months.
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  )
}

function PortfolioEmptyHoldings() {
  return (
    <div className="glass rounded-2xl p-8 text-center ring-1 ring-border/60">
      <p className="text-sm text-muted-foreground">
        No tickers in this portfolio yet. Research a ticker and save catalysts
        from the results page.
      </p>
      <Button
        asChild
        className="bg-gradient-brand mt-4 text-primary-foreground shadow-sm"
      >
        <Link href="/">Research a ticker</Link>
      </Button>
    </div>
  )
}

function buildPortfolioSummary(
  holdings: Array<{ catalystCount: number }>,
  catalysts: PortfolioCatalystEventView[],
  now: number,
): string | null {
  if (holdings.length === 0) {
    return null
  }

  const tickerCount = holdings.length
  const catalystCount = holdings.reduce(
    (total, holding) => total + holding.catalystCount,
    0,
  )

  const nearest = catalysts[0]
  const daysUntil = nearest ? daysUntilAnchor(nearest, now) : null

  const parts = [
    `${tickerCount} ticker${tickerCount === 1 ? "" : "s"}`,
    `${catalystCount} catalyst${catalystCount === 1 ? "" : "s"}`,
  ]

  if (daysUntil !== null) {
    if (daysUntil === 0) {
      parts.push("next event today")
    } else if (daysUntil === 1) {
      parts.push("next event tomorrow")
    } else if (daysUntil > 0) {
      parts.push(`next event in ${daysUntil} days`)
    }
  }

  return parts.join(" · ")
}
