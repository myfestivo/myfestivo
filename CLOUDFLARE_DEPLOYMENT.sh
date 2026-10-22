#!/usr/bin/env bash
# MyFestivo — Cloudflare Workers Deployment Setup
# Generated: October 2026 | Replaces: NETLIFY_DEPLOYMENT.sh
# Production Domain: https://myfestivo.live
# Adapter: @opennextjs/cloudflare (OpenNext)
#
# ─────────────────────────────────────────────────────────────────────────────
# PREREQUISITES
# ─────────────────────────────────────────────────────────────────────────────
#   npm install -g wrangler
#   wrangler login       # authenticates against your Cloudflare account
#
# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: Create Rate Limiting namespaces in the Cloudflare Dashboard
# ─────────────────────────────────────────────────────────────────────────────
#   Workers & Pages → myfestivo → Settings → Rate Limiting
#   Create 3 namespaces and paste their IDs into wrangler.toml:
#     RATE_LIMIT_AUTH       → namespace_id = "1001"  (10 req / 60 s)
#     RATE_LIMIT_SENSITIVE  → namespace_id = "1002"  ( 5 req / 60 s)
#     RATE_LIMIT_STANDARD   → namespace_id = "1003"  (100 req / 60 s)

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: Set non-secret environment variables in the Cloudflare Dashboard
# ─────────────────────────────────────────────────────────────────────────────
#   Workers & Pages → myfestivo → Settings → Variables and Secrets
#   Add the following as plain text (not encrypted):

NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAWXlk_uq532P-NDv_l2qCYT7lYTJ9unKo
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=myfestivo-main.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=myfestivo-main
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=myfestivo-main.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=857484970379
NEXT_PUBLIC_FIREBASE_APP_ID=1:857484970379:web:9e42498cf3633b18eac78e
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-LMS0WSSXL4

NEXT_PUBLIC_APP_URL=https://myfestivo.live
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_XXXXXXXXXXXXXXXX   # paste your Razorpay Key ID
FIREBASE_ADMIN_PROJECT_ID=myfestivo-main
GMAIL_EMAIL=myfestivo@gmail.com

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: Set secrets via Wrangler CLI (encrypted at rest)
# ─────────────────────────────────────────────────────────────────────────────
# Run each command below and paste the secret value when prompted.
# These are NEVER stored in wrangler.toml or source code.

# npx wrangler secret put GMAIL_APP_PASSWORD
# npx wrangler secret put RAZORPAY_KEY_SECRET
# npx wrangler secret put FIREBASE_ADMIN_CLIENT_EMAIL
# npx wrangler secret put FIREBASE_ADMIN_PRIVATE_KEY
#   (For FIREBASE_ADMIN_PRIVATE_KEY, paste the full PEM including -----BEGIN/END----- lines.
#    Wrangler handles multi-line values correctly.)

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: Deploy
# ─────────────────────────────────────────────────────────────────────────────
#
# Option A: Manual CLI deploy
#   npm run deploy
#   (Runs: npx @opennextjs/cloudflare build && npx wrangler deploy)
#
# Option B: CI/CD via GitHub Actions
#   Push code → GitHub, then configure a GitHub Actions workflow:
#   - Trigger: push to main
#   - Job: npm ci && npm run deploy
#   - Add CLOUDFLARE_API_TOKEN as a GitHub Actions secret

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5: Custom Domain
# ─────────────────────────────────────────────────────────────────────────────
#   Workers & Pages → myfestivo → Custom Domains → Add Custom Domain
#   Point myfestivo.live → the deployed Worker.

# ─────────────────────────────────────────────────────────────────────────────
# VERIFICATION CHECKLIST
# ─────────────────────────────────────────────────────────────────────────────
# After deployment verify:
#   ✓ https://myfestivo.live loads without errors
#   ✓ Login works (Firebase Auth — client-side)
#   ✓ /api/auth/check-provider returns correct provider
#   ✓ College email OTP sends (FIREBASE_ADMIN_* + GMAIL_* configured)
#   ✓ Payments work (Razorpay — RAZORPAY_KEY_SECRET configured)
#   ✓ Rate limiting blocks requests at thresholds (check 429 response)
#   ✓ No secrets exposed in browser console (run browser audit)
