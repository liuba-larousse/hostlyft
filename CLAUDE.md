# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

- `npm run dev` — start Next.js dev server (port 3000)
- `npm run build` — production build
- `npm run lint` — ESLint (flat config, Next.js core-web-vitals + TypeScript rules)
- `npm run test` — Playwright e2e tests (requires dev server running separately)
- `npm run test:ui` — Playwright with interactive UI
- Single test: `npx playwright test e2e/auth.spec.ts`

## Architecture

**Stack:** Next.js 16 / React 19 / TypeScript / Tailwind CSS v4 / Supabase (PostgreSQL) / Vercel

**Auth:** NextAuth v5 (beta) with Google OAuth. Access controlled via `ALLOWED_EMAIL_DOMAIN` or `ALLOWED_EMAILS` env vars. JWT sessions, 1-year max age. Config in `lib/auth.ts`.

**Database:** Supabase admin client created via `createSupabaseAdmin()` from `lib/supabase.ts`. Uses service role key for all server-side queries.

**Sensitive data:** AES-256-GCM encryption via `lib/crypto/encrypt.ts` using `ENCRYPTION_KEY` env var. PriceLabs passwords, API keys, and RM Portal credentials are stored encrypted in the database.

**Styling:** Tailwind v4 with PostCSS plugin (`@tailwindcss/postcss`). No `tailwind.config.ts` — theme is defined inline via `@theme` in `app/globals.css`. Fonts: Geist Sans/Mono.

## App Structure

```
app/
  dashboard/           # Auth-protected (layout checks session + team_members table)
    agents/            # Cloud Agents
    artifacts/         # HTML artifact viewer/uploader (stored in Supabase)
    client-reports/    # Tabbed layout: Bookings, OTA Scores, Manage Clients
    clients/           # Client management
    marketing/         # Content marketing
    schedule/          # Weekly scheduling
    team/              # Tabbed layout: Members, Workflows
  auth/signin          # Custom sign-in page
  onboarding/          # New user onboarding (redirected if not in team_members)
  api/                 # ~36 API routes
```

## Key Patterns

**API routes:** All follow `NextRequest`/`NextResponse` pattern. Protected routes check `auth()` session and return 401 if unauthenticated. Example pattern in `app/api/artifacts/route.ts`.

**Tabbed sub-layouts:** Client Reports and Team sections use a shared pattern — a `layout.tsx` with tab navigation (see `app/dashboard/client-reports/layout.tsx` for the template). Tabs render as a horizontal bar with yellow-400 active border.

**Sidebar navigation:** `components/dashboard/sidebar.tsx` defines all nav items. Supports expandable sub-links (see Team and Client Reports entries). Mobile-responsive with slide-over menu.

**Dashboard layout:** Protected by auth check → team_members lookup → redirect chain. Includes Sidebar + main content + CatMascot. Print styles hide sidebar/mascot.

## PriceLabs Reservations & Metrics (API-based)

Reservation data is pulled from the **PriceLabs API** per listing — not scraped. The flow:

1. **Listings** sync from `GET /v1/listings` into `listing_groups` (`POST /api/pricelabs/listings`).
2. **Reservations** are fetched per listing via `lib/pricelabs/reservations.ts` and stored in the `reservations` table (`017_reservations.sql`), keyed by `(client_id, listing_id, reservation_id)`. The original API record is kept in `raw` for re-mapping. `GET /api/pricelabs/daily-report` drives this (cron + manual Sync button). PriceLabs' reservation endpoint/field names vary, so the client tries a few endpoint shapes and maps responses through a tolerant field mapper.
3. **Metrics** (occupancy, ADR, RevPAR, revenue) are computed server-side from reservations joined with listing data in `lib/metrics/reservations-metrics.ts`, exposed via `GET /api/pricelabs/metrics` (per listing, rolled up to building group + client). Stays straddling the window boundary are prorated.

`lib/pricelabs/browser.ts` still provides Playwright Core (bundled Chromium locally; `@sparticuz/chromium-min` on Vercel) for the **OTA scores** scraper (`/api/ota/scrape`). PriceLabs report/bookings scraping has been removed.

## Cron Jobs (vercel.json)

- `/api/cron/marketing` — daily 9am UTC
- `/api/pricelabs/daily-report` — daily 8am UTC (pulls reservations from the PriceLabs API)
- `/api/email/daily-tasks` — daily 8am UTC

## Environment Variables

Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `ENCRYPTION_KEY` (64-char hex), `CRON_SECRET`.

Integrations: `ANTHROPIC_API_KEY`, `HUBSPOT_ACCESS_TOKEN`, `TOGGL_API_TOKEN`, `RESEND_API_KEY`, `FATHOM_API_TOKEN`, `LINKEDIN_CLIENT_ID`/`SECRET`.
