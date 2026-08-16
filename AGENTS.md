# Repository Guidelines

## How to Use This Guide

- Start here for cross-project norms. Tatachio Mirabel is a monorepo with several components.
- Only applications under `apps/` have their own `AGENTS.md` with specific guidelines (e.g., `apps/backend/AGENTS.md`, `apps/frontend/AGENTS.md`).
- Component docs override this file when guidance conflicts.

## Available Skills

Use these skills for detailed patterns on-demand. All skills live in `skills/` at the project root.

### Global Skills

These apply across all components:

| Skill | Description | URL |
|-------|-------------|-----|
| `typescript` | Const types, flat interfaces, utility types, Zod type inference | [SKILL.md](skills/typescript/SKILL.md) |
| `typescript-advanced-types` | Advanced TS: generics, conditional types, mapped types | [SKILL.md](skills/typescript-advanced-types/SKILL.md) |
| `qa` | Tatachio QA flow: run-all orchestrator, disposable-data isolation, autonomous web E2E (port 3456), chaos suites | [SKILL.md](skills/qa/SKILL.md) |
| `git-commit` | Conventional Commits | [SKILL.md](skills/git-commit/SKILL.md) |
| `zod-4` | Zod v4 schemas, Express validation, v3 to v4 migration | [SKILL.md](skills/zod-4/SKILL.md) |
| `skill-creator` | Skill creation patterns | [SKILL.md](skills/skill-creator/SKILL.md) |
| `vercel-react-best-practices` | React 19 performance patterns: memoization, data fetching, bundle optimization | [SKILL.md](skills/vercel-react-best-practices/SKILL.md) |
| `tailwind-4-docs` | Tailwind CSS v4 utilities, variants, theming, dark mode class strategy | [SKILL.md](skills/tailwind-4-docs/SKILL.md) |
| `playwright-best-practices` | Playwright E2E: page objects, flaky-test fixes, auth, mocking, debugging | [SKILL.md](skills/playwright-best-practices/SKILL.md) |

### Auto-invoke Skills

When performing these actions, ALWAYS invoke the corresponding skill FIRST:

| Action | Skill |
|--------|-------|
| Creating git commit | `git-commit` |
| Refactoring TypeScript code | `typescript` |
| Writing or running tests | `qa` |
| Validating data or request bodies | `zod-4` |
| Writing or refactoring React components | `vercel-react-best-practices` |
| Styling with Tailwind classes or dark mode | `tailwind-4-docs` |
| Writing or debugging Playwright E2E tests | `playwright-best-practices` |

---

## Project Overview

Tatachio Mirabel is a cabildo member management system with AI-powered chat, CLI admin, and government-standard Excel reports.

| Component | Location | Tech Stack | AGENTS.md |
|-----------|----------|------------|-----------|
| Backend | `apps/backend/` | Node.js, Express, TypeScript, Prisma, SQLite | [AGENTS.md](apps/backend/AGENTS.md) |
| CLI | `apps/cli/` | Node.js, TypeScript, Commander.js, @inquirer | [AGENTS.md](apps/cli/AGENTS.md) |
| Frontend | `apps/frontend/` | React 19, Vite, TypeScript, Tailwind v4 | [AGENTS.md](apps/frontend/AGENTS.md) |
| Shared | `packages/shared/` | TypeScript, Zod | -- |
| QA Scripts | `scripts/qa/` | Node.js, fetch nativo | -- |
| Docs | `docs/` | Markdown (plan, QA plan) | -- |

Solo las aplicaciones bajo `apps/` tienen `AGENTS.md` propio; los paquetes de soporte (`packages/`, `scripts/`) se guían por este archivo.

---

## Commit & Pull Request Guidelines

Follow conventional-commit style: `<type>[scope]: <description>`

**Types:** `feat`, `fix`, `docs`, `chore`, `perf`, `refactor`, `style`, `test`

**Importante:** Todas las instalaciones de dependencias deben realizarse con `pnpm`, no con `npm` ni `yarn`.

Before creating a PR:
1. Complete checklist in `.github/pull_request_template.md`
2. Run all relevant tests and linters

## QA Disposable (issue #62)

The QA (vitest CLI tests + `scripts/qa/` suites) exercises the REAL backend/CLI but ALWAYS against **fake, disposable data**: isolated `QA_HOME` (fake `$HOME` + `TATACHIO_REPORTES_DIR`), `qa.db`, never the user's real `~/.tatachio` or `mirabel.db`. Principle: **test → report → destroy**.

- Never modify/delete the real `~/.tatachio/config.json`, `~/.tatachio/reportes/`, or any production artifact.
- Before pushing, run `node scripts/qa/cleanup.mjs` (or rely on the pre-push hook: `git config core.hooksPath .githooks`).
- Code comments are always in English.
