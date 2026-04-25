import { cookies, headers } from "next/headers"
import { NextResponse } from "next/server"
import { ConvexHttpClient } from "convex/browser"
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"

import { api } from "@/convex/_generated/api"

const COOKIE_NAME = "stonkseer_anon_trial"

function getSecret() {
  return (
    process.env.ANONYMOUS_TOKEN_SECRET ??
    process.env.CLERK_SECRET_KEY ??
    "local-development-anonymous-token-secret"
  )
}

function signToken(token: string) {
  return createHmac("sha256", getSecret()).update(token).digest("base64url")
}

function verifySignedToken(value: string | undefined) {
  if (!value) {
    return null
  }

  const [token, signature] = value.split(".")

  if (!token || !signature) {
    return null
  }

  const expected = signToken(token)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null
  }

  return token
}

function hashValue(value: string) {
  return createHash("sha256")
    .update(`${getSecret()}:${value}`)
    .digest("hex")
}

function dayKey(now: Date) {
  return now.toISOString().slice(0, 10)
}

async function getIpAddress() {
  const headerStore = await headers()
  const forwardedFor = headerStore.get("x-forwarded-for")

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown"
  }

  return headerStore.get("x-real-ip") ?? "unknown"
}

export async function POST(request: Request) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

  if (!convexUrl) {
    return NextResponse.json(
      { error: "Missing NEXT_PUBLIC_CONVEX_URL" },
      { status: 500 },
    )
  }

  const body = (await request.json()) as { symbol?: unknown }
  const symbol = typeof body.symbol === "string" ? body.symbol : ""
  const cookieStore = await cookies()
  const existingToken = verifySignedToken(cookieStore.get(COOKIE_NAME)?.value)
  const token = existingToken ?? randomBytes(32).toString("base64url")
  const signedToken = `${token}.${signToken(token)}`
  const ipAddress = await getIpAddress()
  const now = new Date()
  const convex = new ConvexHttpClient(convexUrl)

  try {
    const result = await convex.mutation(api.research.requestAnonymousRun, {
      symbol,
      anonymousTokenHash: hashValue(token),
      anonymousIpHash: hashValue(ipAddress),
      dayKey: dayKey(now),
      now: now.getTime(),
    })
    const response = NextResponse.json({
      ...result,
      anonymousTokenHash: hashValue(token),
    })

    response.cookies.set(COOKIE_NAME, signedToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })

    return response
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to start anonymous research",
      },
      { status: 429 },
    )
  }
}
