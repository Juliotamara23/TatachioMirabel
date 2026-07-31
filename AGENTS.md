# Repository Guidelines

## How to Use This Guide

- Start here for cross-project norms. Tatachio Mirabel is a monorepo with several components.
- Each component has an `AGENTS.md` file with specific guidelines (e.g., `apps/backend/AGENTS.md`).
- Component docs override this file when guidance conflicts.

## Available Skills

Use these skills for detailed patterns on-demand. All skills live in `skills/` at the project root.

### Global Skills

These apply across all components:

| Skill | Description | URL |
|-------|-------------|-----|
| `typescript` | Const types, flat interfaces, utility types, Zod type inference | [SKILL.md](skills/typescript/SKILL.md) |
| `typescript-advanced-types` | Advanced TS: generics, conditional types, mapped types | [SKILL.md](skills/typescript-advanced-types/SKILL.md) |
| `vitest` | Vitest testing: config, mocking, snapshots, coverage | [SKILL.md](skills/vitest/SKILL.md) |
| `git-commit` | Conventional Commits | [SKILL.md](skills/git-commit/SKILL.md) |
| `zod-4` | Zod v4 schemas, Express validation, v3 to v4 migration | [SKILL.md](skills/zod-4/SKILL.md) |
| `zod` | Zod patterns: parse, refine, performance, error handling | [SKILL.md](skills/zod/SKILL.md) |
| `skill-creator` | Skill creation patterns | [SKILL.md](skills/skill-creator/SKILL.md) |

### Auto-invoke Skills

When performing these actions, ALWAYS invoke the corresponding skill FIRST:

| Action | Skill |
|--------|-------|
| Creating git commit | `git-commit` |
| Refactoring TypeScript code | `typescript` |
| Writing or running tests | `vitest` |
| Validating data or request bodies | `zod-4` |

---

## Project Overview

Tatachio Mirabel is a cabildo member management system with AI-powered chat, CLI admin, and government-standard Excel reports.

| Component | Location | Tech Stack | AGENTS.md |
|-----------|----------|------------|-----------|
| Backend | `apps/backend/` | Node.js, Express, TypeScript, Prisma, SQLite | [AGENTS.md](apps/backend/AGENTS.md) |
| CLI | `apps/cli/` | Node.js, TypeScript, Commander.js, @inquirer | WIP |
| Shared | `packages/shared/` | TypeScript, Zod | WIP |
| QA Scripts | `scripts/qa/` | Node.js, fetch nativo | WIP |
| Docs | `docs/` | Markdown (plan, QA plan) | -- |

WIP = AGENTS.md pendiente

---

## Commit & Pull Request Guidelines

Follow conventional-commit style: `<type>[scope]: <description>`

**Types:** `feat`, `fix`, `docs`, `chore`, `perf`, `refactor`, `style`, `test`

**Importante:** Todas las instalaciones de dependencias deben realizarse con `pnpm`, no con `npm` ni `yarn`.

Before creating a PR:
1. Complete checklist in `.github/pull_request_template.md`
2. Run all relevant tests and linters
