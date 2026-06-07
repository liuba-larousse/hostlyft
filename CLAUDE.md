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

## PriceLabs Browser Automation

`lib/pricelabs/` uses Playwright Core for browser automation against PriceLabs. Locally uses Playwright's bundled Chromium; on Vercel uses `@sparticuz/chromium-min`. API routes under `/api/pricelabs/` have `maxDuration: 300` (5 min) for long-running scrapes.

## Cron Jobs (vercel.json)

- `/api/cron/marketing` — daily 9am UTC
- `/api/pricelabs/daily-report` — daily 8am UTC
- `/api/email/daily-tasks` — daily 8am UTC
- `/api/pricelabs/daily-report?include=portfolio` — daily 7am UTC

## Environment Variables

Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `ENCRYPTION_KEY` (64-char hex), `CRON_SECRET`.

Integrations: `ANTHROPIC_API_KEY`, `HUBSPOT_ACCESS_TOKEN`, `TOGGL_API_TOKEN`, `RESEND_API_KEY`, `FATHOM_API_TOKEN`, `LINKEDIN_CLIENT_ID`/`SECRET`.
