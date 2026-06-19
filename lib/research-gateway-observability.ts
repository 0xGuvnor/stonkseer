import { normalizeTickerSymbol } from "./ticker-symbol"

export type ResearchGatewayLeg =
  | "gemini-search"
  | "openai-exa-search"
  | "anthropic-search"
  | "xai-search"
  | "followup-queries"
  | "merge-extraction"
  | "reconcile-carryforward"
  | "inrun-dedupe"

export type ResearchGatewaySource =
  | "anonymous"
  | "authenticated"
  | "refresh"

export type ResearchGatewayContext = {
  runId: string
  symbol: string
  source: ResearchGatewaySource
  userId?: string
  strategyVersion: string
}

export type GatewayEnvTag = "production" | "development" | "preview"

type GatewayProviderOptions = {
  gateway: {
    tags: string[]
    user?: string
    models?: string[]
  }
}

const GATEWAY_ENV_VALUES: GatewayEnvTag[] = [
  "production",
  "development",
  "preview",
]

function readGatewayEnvName(): string | undefined {
  return process.env.STONKSEER_GATEWAY_ENV?.trim()
}

export function resolveGatewayEnvTag(
  envName: string | undefined = readGatewayEnvName(),
): GatewayEnvTag {
  if (
    envName &&
    GATEWAY_ENV_VALUES.includes(envName as GatewayEnvTag)
  ) {
    return envName as GatewayEnvTag
  }

  return "development"
}

function buildGatewayTags(
  ctx: ResearchGatewayContext,
  leg: ResearchGatewayLeg,
  envName?: string,
): string[] {
  const ticker = normalizeTickerSymbol(ctx.symbol)

  return [
    "feature:catalyst-research",
    `leg:${leg}`,
    `source:${ctx.source}`,
    `env:${resolveGatewayEnvTag(envName)}`,
    `strategy:${ctx.strategyVersion}`,
    `ticker:${ticker}`,
    `run:${ctx.runId}`,
  ]
}

function resolveGatewayUser(ctx: ResearchGatewayContext): string | undefined {
  if (ctx.source !== "authenticated" || !ctx.userId) {
    return undefined
  }

  return ctx.userId
}

export function buildGatewayProviderOptions(
  ctx: ResearchGatewayContext,
  leg: ResearchGatewayLeg,
  envName?: string,
): GatewayProviderOptions {
  const gateway: GatewayProviderOptions["gateway"] = {
    tags: buildGatewayTags(ctx, leg, envName),
  }

  const user = resolveGatewayUser(ctx)
  if (user) {
    gateway.user = user
  }

  return { gateway }
}

function readExtractionFallbackModels(
  rawValue: string | undefined = process.env.AI_GATEWAY_EXTRACTION_FALLBACK_MODELS,
): string[] | undefined {
  if (!rawValue?.trim()) {
    return undefined
  }

  const models = rawValue
    .split(",")
    .map((model) => model.trim())
    .filter((model) => model.length > 0)

  return models.length > 0 ? models : undefined
}

export function buildExtractionGatewayProviderOptions(
  ctx: ResearchGatewayContext,
  envName?: string,
  fallbackModelsRaw?: string,
): GatewayProviderOptions {
  const options = buildGatewayProviderOptions(
    ctx,
    "merge-extraction",
    envName,
  )
  const models = readExtractionFallbackModels(fallbackModelsRaw)

  if (models) {
    options.gateway.models = models
  }

  return options
}
