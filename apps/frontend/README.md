# Frontend — Tatachio Mirabel Web Admin

React 19 + Vite 5 + TypeScript SPA for the cabildo admin dashboard.

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + React Router v7 |
| Build | Vite 5 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite` plugin, `darkMode: 'class'`) |
| Forms | react-hook-form + @hookform/resolvers + Zod (via `@tatachio/shared`) |
| Virtualization | @tanstack/react-virtual |
| Testing | Vitest + @testing-library/react + @vitest/coverage-v8 |
| E2E | Playwright (under `scripts/qa/suites/web/`) |

## Scripts

```bash
# Development
pnpm --filter frontend dev          # Vite dev server (hot reload)
pnpm --filter frontend build        # Production build (tsc + vite build)
pnpm --filter frontend preview      # Preview production build

# Testing
pnpm --filter frontend test         # Run all unit tests (vitest run)
pnpm --filter frontend test:watch   # Watch mode
pnpm --filter frontend test:coverage # With coverage (≥80% lines/branches on components/ + hooks/)
pnpm --filter frontend test:e2e     # Playwright E2E (requires backend running)
```

## Architecture

```
src/
├── main.tsx              # Entry: providers + ReactDOM.createRoot
├── App.tsx               # Routes (React Router v7)
├── lib/api/              # Typed fetch client + per-endpoint functions
├── contexts/             # AuthContext, CabildoContext, ThemeContext
├── hooks/                # useChatStream (state machine), useDebouncedValue
├── features/             # One folder per capability (auth, dashboard, miembros, ...)
├── components/           # Shared primitives (AppShell, Topbar, Table, ConfirmDialog, ...)
└── types/                # Re-exports from @tatachio/shared
```

### Key decisions

- **No global store.** Three small React Contexts (auth, cabildo, theme) — the app is single-tenant admin.
- **Chat streams via `fetch` + `getReader()` + `TextDecoder`** (raw UTF-8). NOT SSE/EventSource. Backend writes `text/plain; charset=utf-8`.
- **Validation via `@tatachio/shared` Zod schemas** — single source of truth with the backend.
- **Scoped re-fetch.** Features consume `useCabildo().selectedId` and re-fetch on change.

## Environment

`VITE_API_BASE_URL` — backend base URL (default `http://localhost:3000`).

Set in `apps/frontend/.env.development`:
```
VITE_API_BASE_URL=http://localhost:3000
```

## E2E Tests

Playwright specs live under `scripts/qa/suites/web/`. They require:
1. A running QA backend (seeded via `scripts/qa/lib/seed-db.mjs`)
2. A production build served via `vite preview --port 5173`

Run from the root: `pnpm test:web`

Admin credentials for E2E: `admin@tatachio.org` / `admin123` (from `scripts/qa/fixtures/seed.json`).
