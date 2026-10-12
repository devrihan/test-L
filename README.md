# Loam — Inferentics Analytics Frontend

Frontend design implementation for the Inferentics teacher analytics platform, built with Next.js, Tailwind CSS v4, and shadcn/ui.

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm, yarn, pnpm, or bun
- **Keycloak** running locally (required for login — see below)

## Getting Started

**1. Clone the repository**

```bash
git clone https://github.com/Niraj754/loam.git
cd loam
```

**2. Install dependencies**

```bash
npm install
```

**3. Run the development server**

```bash
npm run dev
```

**4. Open in your browser**

Visit [http://localhost:3000](http://localhost:3000)

> **Note:** You need Keycloak running locally to log in. Without it you will be stuck on the login page.  
> To skip auth and preview the design directly, see [Bypassing Authentication](#bypassing-authentication-for-design-preview) below.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_KEYCLOAK_URL` | URL of your local Keycloak instance (e.g. `http://localhost:8180`) |
| `NEXT_PUBLIC_KEYCLOAK_REALM` | Keycloak realm name |
| `NEXT_PUBLIC_KEYCLOAK_CLIENT_ID` | Keycloak client ID |
| `KEYCLOAK_ADMIN_USERNAME` | Keycloak admin username (server-side only) |
| `KEYCLOAK_ADMIN_PASSWORD` | Keycloak admin password (server-side only) |
| `NEXT_PUBLIC_API_URL` | Main backend API URL |
| `NEXT_PUBLIC_AGGREGATED_DATA_API_URL` | Aggregated data API URL |
| `NEXT_PUBLIC_BEAVER_API_URL` | Beaver service API URL |

## Keycloak Setup (for full auth flow)

The app uses a `token` cookie set by Keycloak after login. You need a local Keycloak instance configured and running before the login flow will work.

If you don't have Keycloak set up, use the bypass method below to view the design immediately.

## Bypassing Authentication (for Design Preview)

To skip the login requirement and jump straight into the dashboard, comment out the middleware logic in `middleware.ts`:

**`middleware.ts`** — change it to:

```ts
import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/login'],
}
```

Then navigate directly to [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

> **Remember to revert this change** before committing — never push the bypassed middleware to the repository.

## Project Structure

```
app/
  (auth)/login/        # Login page
  (dashboard)/         # Dashboard layout + pages
    dashboard/         # Main dashboard & assessment detail
    chapter/           # Chapter performance page
    student/           # Students page
    question/          # Questions page
  exam/[examId]/       # Exam detail page (remediation + analysis)
components/            # Reusable UI components
  analysis-*.tsx       # Analysis tab components (chart, tables, sheets)
  topic-table.tsx      # Remediation topic table
  page-filters.tsx     # Subject / Grade / Section filters
  stat-card.tsx        # Assessment card
tokens/                # Figma design tokens (source of truth)
app/theme.css          # Generated CSS variables from tokens
```

## Tech Stack

- [Next.js 15](https://nextjs.org) — App Router
- [Tailwind CSS v4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com) — component library
- [Recharts](https://recharts.org) — charts
- [Lucide React](https://lucide.dev) — icons

## Design Tokens

CSS variables in `app/theme.css` are generated from the Figma token export in `tokens/`. Key token groups:

- `--inferentics-performance-*` — chart/table performance colours
- `--inferentics-analytics-*` — analytics surface and text colours
- `--inferentics-brand-*` — brand green palette
- `--shadcn-tokens-*` — shadcn component aliases
