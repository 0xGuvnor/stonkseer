import { describe, expect, test } from "bun:test"

import {
  buildExtractionGatewayProviderOptions,
  buildGatewayProviderOptions,
  resolveGatewayEnvTag,
  type ResearchGatewayContext,
} from "./research-gateway-observability"

const baseCtx: ResearchGatewayContext = {
  runId: "k57abc123def456",
  symbol: "aapl",
  source: "authenticated",
  userId: "jd7user890",
  strategyVersion: "catalyst-timing-v2",
}

describe("resolveGatewayEnvTag", () => {
  test("defaults to development when unset or invalid", () => {
    expect(resolveGatewayEnvTag(undefined)).toBe("development")
    expect(resolveGatewayEnvTag("")).toBe("development")
    expect(resolveGatewayEnvTag("staging")).toBe("development")
  })

  test("accepts production, development, and preview", () => {
    expect(resolveGatewayEnvTag("production")).toBe("production")
    expect(resolveGatewayEnvTag("development")).toBe("development")
    expect(resolveGatewayEnvTag("preview")).toBe("preview")
  })
})

describe("buildGatewayProviderOptions", () => {
  test("includes base tags for each leg", () => {
    const options = buildGatewayProviderOptions(
      baseCtx,
      "anthropic-search",
      "production",
    )

    expect(options.gateway.tags).toEqual([
      "feature:catalyst-research",
      "leg:anthropic-search",
      "source:authenticated",
      "env:production",
      "strategy:catalyst-timing-v2",
      "ticker:AAPL",
      "run:k57abc123def456",
    ])
  })

  test("sets user only for authenticated runs with userId", () => {
    expect(
      buildGatewayProviderOptions(baseCtx, "gemini-search").gateway.user,
    ).toBe("jd7user890")

    expect(
      buildGatewayProviderOptions(
        { ...baseCtx, source: "anonymous", userId: undefined },
        "gemini-search",
      ).gateway.user,
    ).toBeUndefined()

    expect(
      buildGatewayProviderOptions(
        { ...baseCtx, source: "refresh", userId: "jd7user890" },
        "gemini-search",
      ).gateway.user,
    ).toBeUndefined()

    expect(
      buildGatewayProviderOptions(
        { ...baseCtx, userId: undefined },
        "gemini-search",
      ).gateway.user,
    ).toBeUndefined()
  })

  test("normalizes ticker in tags", () => {
    const options = buildGatewayProviderOptions(
      { ...baseCtx, symbol: "  nvda " },
      "xai-search",
    )

    expect(options.gateway.tags).toContain("ticker:NVDA")
  })
})

describe("buildExtractionGatewayProviderOptions", () => {
  test("uses merge-extraction leg and omits models when unset", () => {
    const options = buildExtractionGatewayProviderOptions(baseCtx)

    expect(options.gateway.tags).toContain("leg:merge-extraction")
    expect(options.gateway.models).toBeUndefined()
  })

  test("includes failover models when env var is set", () => {
    const options = buildExtractionGatewayProviderOptions(
      baseCtx,
      undefined,
      "anthropic/claude-sonnet-4.6, openai/gpt-5.4",
    )

    expect(options.gateway.models).toEqual([
      "anthropic/claude-sonnet-4.6",
      "openai/gpt-5.4",
    ])
  })

  test("omits models for empty fallback env value", () => {
    const options = buildExtractionGatewayProviderOptions(
      baseCtx,
      undefined,
      "  ,  ",
    )

    expect(options.gateway.models).toBeUndefined()
  })
})
