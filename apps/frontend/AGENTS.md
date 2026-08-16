# Frontend Guidelines

## How to Use This Guide

- Start here for frontend-specific norms. See root [AGENTS.md](../../AGENTS.md) for cross-project norms and global skills.
- All skills live in `skills/` at the project root.

## Available Skills

Use these skills for detailed patterns on-demand.

### Frontend-Specific Skills

| Skill | Description | URL |
|-------|-------------|-----|
| `vercel-react-best-practices` | React 19 performance patterns: memoization, data fetching, bundle optimization | [SKILL.md](../../skills/vercel-react-best-practices/SKILL.md) |
| `react-expert` | Authoritative React API research: usage examples, caveats, warnings, errors | [SKILL.md](../../skills/react-expert/SKILL.md) |
| `tailwind-4-docs` | Tailwind CSS v4 utilities, variants, theming, dark mode class strategy | [SKILL.md](../../skills/tailwind-4-docs/SKILL.md) |
| `playwright-best-practices` | Playwright E2E: page objects, flaky-test fixes, auth, mocking, debugging | [SKILL.md](../../skills/playwright-best-practices/SKILL.md) |

### Global Skills (also in root AGENTS.md)

| Skill | Description |
|-------|-------------|
| `typescript` | Const types, flat interfaces, utility types, Zod type inference |
| `typescript-advanced-types` | Advanced TS: generics, conditional types, mapped types |
| `qa` | Tatachio QA flow: run-all orchestrator, disposable-data isolation, autonomous web E2E (port 3456), chaos suites |
| `git-commit` | Conventional Commits |
| `zod-4` | Zod v4 schemas, Express validation, v3 to v4 migration |
| `zod` | Zod patterns: parse, refine, performance, error handling |
| `skill-creator` | Skill creation patterns |

### Auto-invoke Skills

When performing these actions, ALWAYS invoke the corresponding skill FIRST:

| Action | Skill |
|--------|-------|
| Writing or refactoring React components | `vercel-react-best-practices` |
| Researching React API behavior or caveats | `react-expert` |
| Styling with Tailwind classes or dark mode | `tailwind-4-docs` |
| Writing or debugging Playwright E2E tests | `playwright-best-practices` |
| Writing or running tests (unit or E2E) | `qa` |
| Validating forms or API payloads | `zod-4` |
| Creating git commit | `git-commit` |
| Refactoring TypeScript code | `typescript` |

---

## Project Overview

Tatachio Mirabel Frontend is the web admin SPA (Fase 2) for cabildo member management, consuming the backend API via `@tatachio/shared` Zod schemas.

| Component | Location | Tech Stack |
|-----------|----------|------------|
| Frontend | `apps/frontend/` | React 19, Vite, TypeScript, Tailwind v4, react-router v7 |
| E2E suite | `scripts/qa/suites/web/` | Playwright (autonomous: QA backend 3456 + preview 5173) |

### Structure

- `src/features/<capability>/` — one folder per module: auth, dashboard, miembros, familias, cabildos, captains, chat, reportes
- `src/components/` — cross-feature primitives (Table virtualized, KpiCard, Topbar, AppShell, ConfirmDialog)
- `src/contexts/` — AuthContext, CabildoContext, ThemeContext (no global store)
- `src/hooks/` — useChatStream (state machine), useDebouncedValue, useScopedQuery
- `src/lib/api/` — typed fetch client with `{ error, retryAfter?, details? }` envelope

---

## Conventions

- **Code comments in English.** UI labels in Spanish (Dashboard, Miembros, Familias, Cabildos, Capitanas, Chat, Reportes).
- **pnpm only** for dependency management.
- **Imports from `@tatachio/shared` must be browser-safe**: never import `@tatachio/shared/node` (pulls node:os/path — breaks the browser bundle).
- **localStorage keys**: `tatachio:auth` (token+user), `tatachio:cabildoId` (selected cabildo), `tatachio:theme` (light/dark). Persist on change, restore on boot.
- **Dark mode**: `dark` class on `<html>` (Tailwind `darkMode: 'class'`), pre-hydration script in index.html to avoid FOUC.
- **Palette**: orange `#EA580C` (light) / `#FB923C` (dark); green `#16A34A` / `#4ADE80`; surfaces `white`/`#F8FAFC` vs `#0F172A`/`#1E293B`.
- **Cabildo scoping**: all scoped views (dashboard, miembros, familias, capitanas) MUST pass the selected `cabildoId`; re-fetch on selector change.
- **Tables**: use the virtualized `Table` component (`@tanstack/react-virtual`) — no backend pagination.
- **Interactive elements**: add `data-testid` attributes for Playwright determinism.
- **Chat streaming**: `fetch` + `response.body.getReader()` + TextDecoder on raw UTF-8 chunks. NEVER use SSE/EventSource. Handle 429 (`retryAfter` soft retry) and ModelNotFound (`availableModels`).

---

## QA

- **Unit tests**: `pnpm --filter frontend test` (Vitest + Testing Library). Coverage thresholds: `src/components/**` ≥80% lines/≥70% branches, `src/hooks/**` ≥80%.
- **Build**: `pnpm --filter frontend build` (tsc + vite build).
- **E2E (autonomous)**: `pnpm --filter frontend test:e2e` — Playwright boots its own QA backend on port 3456 (seeded qa.db, isolated QA_HOME) + frontend preview on 5173. Never touches dev servers. Headed locally (`headless: !!CI`), no screenshots/traces.
- **Demo video**: `pnpm --filter frontend exec playwright test --config=../../scripts/qa/suites/web/playwright.video.config.ts demo.spec.ts` — records one human-paced walkthrough .webm (outputDir `/mnt/e/MediaProyects/web-e2e-demo`).
- **NEVER modify code or specs during a QA run** (skill `qa` hard rule). A failing test is a reportable defect, not a license to patch the set.
- Before pushing, run `node scripts/qa/cleanup.mjs` (or rely on the pre-push hook: `git config core.hooksPath .githooks`).

---

## Commit & Pull Request Guidelines

Follow conventional-commit style: `<type>[scope]: <description>`

**Types:** `feat`, `fix`, `docs`, `chore`, `perf`, `refactor`, `style`, `test`

**Importante:** Todas las instalaciones de dependencias deben realizarse con `pnpm`, no con `npm` ni `yarn`.

Before creating a PR:
1. Complete checklist in `.github/pull_request_template.md` (if exists)
2. Run all relevant tests and linters
