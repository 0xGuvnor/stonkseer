import { TickerResearchClient } from "./ticker-research-client"

function normalizeTickerParam(raw: string): string {
  return raw.trim().toUpperCase()
}

export default async function TickerResearchPage({
  params,
}: {
  params: Promise<{ ticker: string }>
}) {
  const { ticker } = await params
  const normalized = normalizeTickerParam(ticker)

  return <TickerResearchClient ticker={normalized} />
}
