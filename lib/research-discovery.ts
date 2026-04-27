import type { CatalystResearch } from "./research-contract"

export type SearchBucket =
  | "official"
  | "branded_event"
  | "market_news"
  | "regulatory"
  | "financial"
  | "partnership"
  | "product"
  | "corporate"
  | "industry"
  | "raw_symbol"

export type SearchQuery = {
  bucket: SearchBucket
  query: string
  includeDomains?: string[]
  maxResults?: number
}

export type SearchQueryDiagnostic = {
  bucket: SearchBucket
  query: string
  includeDomains?: string[]
  maxResults?: number
  resultCount: number
  keptCount: number
  urls: string[]
  error?: string
}

export type SourceSnippet = {
  url: string
  title: string
  publisher: string
  quote: string
  publishedAt?: string
}

export type ResearchCandidate = {
  label: string
  category: CatalystResearch["events"][number]["eventType"]
  score: number
  reason: string
  sourceUrls: string[]
}

const MAX_RESEARCH_CANDIDATES = 18

function cleanCompanyName(companyName?: string) {
  return companyName
    ?.replace(
      /\b(incorporated|inc\.?|corporation|corp\.?|limited|ltd\.?|plc|holdings?|class [a-z]|common stock|ordinary shares)\b/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim()
}

function hostnameFromUrl(value?: string) {
  if (!value) {
    return undefined
  }

  try {
    return new URL(value).hostname.replace(/^www\./, "")
  } catch {
    return undefined
  }
}

export function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function snippetHostname(snippet: SourceSnippet): string {
  try {
    return new URL(snippet.url).hostname.replace(/^www\./, "")
  } catch {
    return snippet.publisher.replace(/^www\./, "")
  }
}

/** Prefer breadth of publishers when we have more URLs than the model budget. */
export function diversifySnippetsByDomain(
  snippets: SourceSnippet[],
  max: number,
): SourceSnippet[] {
  if (snippets.length <= max) {
    return snippets
  }

  const byHost = new Map<string, SourceSnippet[]>()
  const hostOrder: string[] = []

  for (const snippet of snippets) {
    const host = snippetHostname(snippet)
    if (!byHost.has(host)) {
      hostOrder.push(host)
      byHost.set(host, [])
    }
    byHost.get(host)!.push(snippet)
  }

  const result: SourceSnippet[] = []
  while (result.length < max) {
    let progressed = false
    for (const host of hostOrder) {
      const bucket = byHost.get(host)
      if (bucket && bucket.length > 0) {
        const next = bucket.shift()
        if (next) {
          result.push(next)
          progressed = true
          if (result.length >= max) {
            break
          }
        }
      }
    }
    if (!progressed) {
      break
    }
  }

  return result
}

function industryTailQueries(
  companyLabel: string,
  yearWindow: string,
  industry?: string,
): SearchQuery[] {
  const i = industry?.toLowerCase() ?? ""
  const out: SearchQuery[] = []

  if (/(bio|pharma|health|drug|medical|therap|genetic|clinical|diagnostic)/.test(i)) {
    out.push({
      bucket: "regulatory",
      query: `${companyLabel} FDA PDUFA advisory committee clinical trial readout topline data ${yearWindow}`,
      maxResults: 6,
    })
  }

  if (/(software|technology|semi|internet|hardware|cloud|saas|it services)/.test(i)) {
    out.push({
      bucket: "industry",
      query: `${companyLabel} developer conference platform roadmap enterprise customer momentum ${yearWindow}`,
      maxResults: 5,
    })
  }

  if (/(bank|financial|insurance|capital|credit|reit|asset management)/.test(i)) {
    out.push({
      bucket: "industry",
      query: `${companyLabel} investor conference banking forum CCAR stress test financial forum ${yearWindow}`,
      maxResults: 5,
    })
  }

  if (/(energy|oil|gas|solar|mining|utility|power|uranium|nuclear|reactor|enrichment|fuel|clean energy)/.test(i)) {
    out.push(
      {
        bucket: "industry",
        query: `${companyLabel} production guidance capacity project commissioning FID sanction ${yearWindow}`,
        maxResults: 5,
      },
      {
        bucket: "regulatory",
        query: `${companyLabel} regulatory approval license permit NRC DOE FERC environmental review project timeline ${yearWindow}`,
        maxResults: 6,
      },
      {
        bucket: "industry",
        query: `${companyLabel} nuclear uranium SMR reactor fuel supply offtake permitting milestone ${yearWindow}`,
        maxResults: 5,
      },
    )
  }

  return out
}

function recurringEventDiscoveryQueries(
  companyLabel: string,
  officialDomain: string | undefined,
  yearWindow: string,
): SearchQuery[] {
  const officialDomains = officialDomain ? [officialDomain] : undefined

  return [
    {
      bucket: "branded_event",
      query: `${companyLabel} annual developer conference keynote product announcements ${yearWindow}`,
      includeDomains: officialDomains,
      maxResults: 8,
    },
    {
      bucket: "branded_event",
      query: `${companyLabel} annual customer conference user conference summit keynote product announcements ${yearWindow}`,
      includeDomains: officialDomains,
      maxResults: 8,
    },
    {
      bucket: "branded_event",
      query: `${companyLabel} official event keynote product launch announcements ${yearWindow}`,
      includeDomains: officialDomains,
      maxResults: 8,
    },
    {
      bucket: "branded_event",
      query: `${companyLabel} recurring annual event conference keynote launch roadmap ${yearWindow}`,
      maxResults: 8,
    },
  ]
}

export function buildSearchQueries(
  symbol: string,
  companyName: string | undefined,
  companyWebsite: string | undefined,
  now: number,
  industry?: string,
): SearchQuery[] {
  const currentYear = new Date(now).getUTCFullYear()
  const nextYear = currentYear + 1
  const shortCompanyName = cleanCompanyName(companyName)
  const companyLabel = shortCompanyName
    ? `${shortCompanyName} ${symbol}`
    : symbol
  const officialDomain = hostnameFromUrl(companyWebsite)
  const yearWindow = `${currentYear} ${nextYear}`
  const queries: SearchQuery[] = [
    {
      bucket: "market_news",
      query: `${companyLabel} upcoming catalysts milestones next 12 months ${yearWindow}`,
      maxResults: 6,
    },
    {
      bucket: "financial",
      query: `${companyLabel} investor relations calendar annual meeting shareholder meeting earnings call investor day ${yearWindow}`,
      maxResults: 6,
    },
    {
      bucket: "financial",
      query: `${companyLabel} corporate presentation conference webcast fireside chat speaking slot investor conference ${yearWindow}`,
      maxResults: 6,
    },
    {
      bucket: "branded_event",
      query: `${companyLabel} trade show user conference summit keynote booth exhibition ${yearWindow}`,
      maxResults: 5,
    },
    {
      bucket: "branded_event",
      query: `${companyLabel} branded annual conference event name keynote registration agenda ${yearWindow}`,
      maxResults: 6,
    },
    {
      bucket: "partnership",
      query: `${companyLabel} strategic partnership collaboration joint venture OEM supply agreement customer win ${yearWindow}`,
      maxResults: 5,
    },
    {
      bucket: "regulatory",
      query: `${companyLabel} Form 8-K material definitive agreement press release exhibit future ${yearWindow}`,
      includeDomains: ["sec.gov"],
      maxResults: 6,
    },
    {
      bucket: "corporate",
      query: `${companyLabel} ${symbol} merger acquisition spin-off restructuring shareholder vote proxy ${yearWindow}`,
      includeDomains: ["sec.gov"],
      maxResults: 5,
    },
    {
      bucket: "corporate",
      query: `${companyLabel} lock-up expiration selling restrictions insider Rule 144 resale float supply ${yearWindow}`,
      maxResults: 6,
    },
    {
      bucket: "product",
      query: `${companyLabel} product roadmap launch production ramp capacity expansion commercialization ${yearWindow}`,
      maxResults: 6,
    },
    {
      bucket: "regulatory",
      query: `${companyLabel} regulatory approval rollout geographic expansion legal decision trial data ${yearWindow}`,
      maxResults: 6,
    },
    {
      bucket: "market_news",
      query: `${companyLabel} management guidance capex targets production deliveries milestones ${yearWindow}`,
      maxResults: 6,
    },
    {
      bucket: "financial",
      query: `${companyLabel} SEC 10-K 10-Q earnings transcript future plans milestones ${yearWindow}`,
      maxResults: 5,
    },
    {
      bucket: "financial",
      query: `${companyLabel} analyst day investor presentation roadmap ${yearWindow}`,
      maxResults: 5,
    },
    {
      bucket: "market_news",
      query: `${companyLabel} news upcoming event milestone catalyst ${yearWindow}`,
      maxResults: 5,
    },
  ]

  if (officialDomain) {
    queries.unshift(
      {
        bucket: "official",
        query: `${companyLabel} official investor relations events calendar milestones ${yearWindow}`,
        includeDomains: [officialDomain],
        maxResults: 5,
      },
      {
        bucket: "official",
        query: `${companyLabel} official newsroom product launch production regulatory update ${yearWindow}`,
        includeDomains: [officialDomain],
        maxResults: 5,
      },
      {
        bucket: "official",
        query: `${companyLabel} official events conference agenda registration keynote ${yearWindow}`,
        includeDomains: [officialDomain],
        maxResults: 5,
      },
    )
  }

  return [
    ...recurringEventDiscoveryQueries(companyLabel, officialDomain, yearWindow),
    ...queries,
    ...industryTailQueries(companyLabel, yearWindow, industry),
    {
      bucket: "raw_symbol",
      query: `${symbol} $${symbol} upcoming catalysts next 12 months ${yearWindow}`,
      maxResults: 4,
    },
  ]
}

export function selectBalancedSearchPlan(
  plan: SearchQuery[],
  maxQueries: number,
): SearchQuery[] {
  if (plan.length <= maxQueries) {
    return plan
  }

  const selected = new Set<number>()
  const balanced: SearchQuery[] = []
  const priorityBuckets: SearchBucket[] = [
    "official",
    "branded_event",
    "regulatory",
    "market_news",
    "product",
    "financial",
    "partnership",
    "corporate",
    "industry",
    "raw_symbol",
  ]

  for (const bucket of priorityBuckets) {
    const index = plan.findIndex(
      (query, queryIndex) =>
        query.bucket === bucket && !selected.has(queryIndex),
    )

    if (index >= 0) {
      selected.add(index)
      balanced.push(plan[index])
    }

    if (balanced.length >= maxQueries) {
      return balanced
    }
  }

  for (const [index, query] of plan.entries()) {
    if (!selected.has(index)) {
      balanced.push(query)
    }

    if (balanced.length >= maxQueries) {
      break
    }
  }

  return balanced
}

const CATALYST_SIGNAL_RULES: Array<{
  category: ResearchCandidate["category"]
  terms: string[]
  reason: string
}> = [
  {
    category: "conference",
    terms: [
      "conference",
      "keynote",
      "summit",
      "annual event",
      "developer event",
      "customer event",
      "registration",
      "agenda",
      "venue",
      "expo",
      "trade show",
      "webcast",
      "fireside chat",
    ],
    reason: "Branded company or industry event signal",
  },
  {
    category: "regulatory",
    terms: [
      "approval",
      "authorization",
      "license",
      "permit",
      "regulatory",
      "commission",
      "agency",
      "review",
      "ruling",
      "decision",
      "deadline",
      "timeline",
      "nrc",
      "doe",
      "ferc",
      "fda",
      "pdufa",
      "advisory committee",
      "environmental assessment",
      "certification",
    ],
    reason: "Regulatory, permit, or agency timeline signal",
  },
  {
    category: "product",
    terms: [
      "launch",
      "roadmap",
      "rollout",
      "release",
      "preview",
      "beta",
      "general availability",
      "new product",
      "platform",
      "commercialization",
      "production ramp",
    ],
    reason: "Product launch or commercialization signal",
  },
  {
    category: "partnership",
    terms: [
      "partnership",
      "collaboration",
      "joint venture",
      "supply agreement",
      "offtake",
      "customer win",
      "contract",
      "strategic agreement",
      "memorandum of understanding",
    ],
    reason: "Partnership, contract, or customer commitment signal",
  },
  {
    category: "corporate",
    terms: [
      "shareholder meeting",
      "proxy",
      "vote",
      "merger",
      "acquisition",
      "spin-off",
      "financing",
      "restructuring",
      "capital raise",
      "lock-up",
      "lockup",
      "lock up",
      "rule 144",
      "resale registration",
      "s-3",
      "shelf registration",
      "insider selling",
      "selling window",
      "unlock",
    ],
    reason: "Corporate action, shareholder, or float/supply timeline signal",
  },
  {
    category: "earnings",
    terms: [
      "earnings",
      "earnings call",
      "results",
      "guidance",
      "fiscal",
      "quarter",
      "investor day",
      "analyst day",
    ],
    reason: "Financial reporting or investor communication signal",
  },
]

function scoreTerms(text: string, terms: string[]) {
  let score = 0

  for (const term of terms) {
    if (text.includes(term)) {
      score += term.includes(" ") ? 2 : 1
    }
  }

  return score
}

export function buildResearchCandidates(
  snippets: SourceSnippet[],
): ResearchCandidate[] {
  const byKey = new Map<string, ResearchCandidate>()

  for (const snippet of snippets) {
    const text = `${snippet.title} ${snippet.quote}`.toLowerCase()

    for (const rule of CATALYST_SIGNAL_RULES) {
      const score = scoreTerms(text, rule.terms)

      if (score === 0) {
        continue
      }

      const label = compactWhitespace(snippet.title).slice(0, 140)
      const key = `${rule.category}:${label.toLowerCase()}`
      const existing = byKey.get(key)

      if (existing) {
        existing.score += score
        if (!existing.sourceUrls.includes(snippet.url)) {
          existing.sourceUrls.push(snippet.url)
        }
        continue
      }

      byKey.set(key, {
        label,
        category: rule.category,
        score,
        reason: rule.reason,
        sourceUrls: [snippet.url],
      })
    }
  }

  return Array.from(byKey.values())
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, MAX_RESEARCH_CANDIDATES)
    .map((candidate) => ({
      ...candidate,
      sourceUrls: candidate.sourceUrls.slice(0, 4),
    }))
}
