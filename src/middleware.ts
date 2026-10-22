/**
 * middleware.ts — Next.js Middleware (runs on Cloudflare Workers edge via OpenNext)
 *
 * Replaces the former netlify/edge-functions/rate-limiter.ts.
 * Cloudflare bindings are accessed via getCloudflareContext() from @opennextjs/cloudflare.
 *
 * Rate groups — mirroring Rate limiting.md:
 *   SENSITIVE  (/api/email/signup-otp, /api/auth/send-college-otp,
 *               /api/auth/verify-college-otp, /api/payments/verify)  →  5 / 60 s
 *   AUTH       (/api/auth/forgot-password, /api/auth/is-admin,
 *               /api/auth/check-provider)                            → 10 / 60 s
 *   STANDARD   (all other /api/*)                                   → 100 / 60 s
 *
 * In local dev (next dev), bindings are absent so middleware is a no-op pass-through.
 * In production (Cloudflare Workers), bindings are resolved from wrangler.toml.
 */

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getCloudflareContext } from "@opennextjs/cloudflare"

// ─── Binding type (Cloudflare Workers Rate Limiting API) ─────────────────────
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

interface CloudflareEnv {
  RATE_LIMIT_AUTH?: RateLimiter
  RATE_LIMIT_SENSITIVE?: RateLimiter
  RATE_LIMIT_STANDARD?: RateLimiter
}

// ─── Route → limiter mapping (first match wins) ───────────────────────────────
const SENSITIVE_PREFIXES = [
  "/api/email/signup-otp",
  "/api/auth/send-college-otp",
  "/api/auth/verify-college-otp",
  "/api/payments/verify",
]

const AUTH_PREFIXES = [
  "/api/auth/forgot-password",
  "/api/auth/is-admin",
  "/api/auth/check-provider",
]

function getLimiter(path: string, env: CloudflareEnv): RateLimiter | null {
  if (SENSITIVE_PREFIXES.some((p) => path.startsWith(p))) {
    return env.RATE_LIMIT_SENSITIVE ?? null
  }
  if (AUTH_PREFIXES.some((p) => path.startsWith(p))) {
    return env.RATE_LIMIT_AUTH ?? null
  }
  return env.RATE_LIMIT_STANDARD ?? null
}

// ─── Middleware handler ───────────────────────────────────────────────────────
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // getCloudflareContext() is only available when running inside a CF Worker.
  // It throws in local `next dev` — catch it and pass through.
  let env: CloudflareEnv
  try {
    const ctx = await getCloudflareContext({ async: true })
    env = ctx.env as CloudflareEnv
  } catch {
    // Not running on Cloudflare (local dev) — skip rate limiting
    return NextResponse.next()
  }

  const limiter = getLimiter(path, env)
  if (!limiter) return NextResponse.next()

  // cf-connecting-ip is Cloudflare's verified client IP (always set in Workers)
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"

  const { success } = await limiter.limit({ key: `${ip}|${path}` })

  if (!success) {
    return new NextResponse(
      JSON.stringify({
        success: false,
        error: "Too Many Requests",
        message: "Rate limit exceeded. Please wait before retrying.",
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  return NextResponse.next()
}

// Only intercept /api/* routes — all page routes are unaffected
export const config = {
  matcher: ["/api/:path*"],
}
