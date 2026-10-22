/**
 * middleware.ts — Next.js Middleware (runs on Cloudflare Workers edge via OpenNext)
 *
 * Replaces the former netlify/edge-functions/rate-limiter.ts.
 * On Cloudflare, rate limiting is handled by native Workers Rate Limiting bindings
 * (RATE_LIMIT_AUTH, RATE_LIMIT_SENSITIVE, RATE_LIMIT_STANDARD) declared in wrangler.toml.
 *
 * Fallback: if the bindings are absent (local dev), the middleware is a no-op pass-through.
 *
 * Rate groups — mirroring Rate limiting.md:
 *   SENSITIVE  (/api/email/signup-otp, /api/auth/send-college-otp,
 *               /api/auth/verify-college-otp, /api/payments/verify)  →  5 / 60 s
 *   AUTH       (/api/auth/forgot-password, /api/auth/is-admin,
 *               /api/auth/check-provider)                            → 10 / 60 s
 *   STANDARD   (all other /api/*)                                   → 100 / 60 s
 *
 * Client IP is read from cf-connecting-ip (set by Cloudflare's network) with
 * fallback to x-forwarded-for for local dev compatibility.
 */

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// ─── Binding type (Cloudflare Workers Rate Limiting API) ─────────────────────
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

// Extended env — injected by OpenNext from wrangler.toml bindings
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

function getLimiter(
  path: string,
  env: CloudflareEnv
): RateLimiter | null {
  if (SENSITIVE_PREFIXES.some((p) => path.startsWith(p))) {
    return env.RATE_LIMIT_SENSITIVE ?? null
  }
  if (AUTH_PREFIXES.some((p) => path.startsWith(p))) {
    return env.RATE_LIMIT_AUTH ?? null
  }
  // Everything else under /api/* → standard
  return env.RATE_LIMIT_STANDARD ?? null
}

// ─── Middleware handler ───────────────────────────────────────────────────────
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Extract Cloudflare env bindings injected by OpenNext
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfEnv = (request as any).cf?.env as CloudflareEnv | undefined

  // If bindings are absent (local dev / non-Cloudflare), pass through
  if (!cfEnv) return NextResponse.next()

  const limiter = getLimiter(path, cfEnv)
  if (!limiter) return NextResponse.next()

  // Prefer Cloudflare's verified IP header; fall back to x-forwarded-for for dev
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
