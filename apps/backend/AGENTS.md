# Backend Guidelines

## How to Use This Guide

- Start here for backend-specific norms. See root [AGENTS.md](../../AGENTS.md) for cross-project norms and global skills.
- All skills live in `skills/` at the project root.

## Available Skills

Use these skills for detailed patterns on-demand.

### Backend-Specific Skills

| Skill | Description | URL |
|-------|-------------|-----|
| `express-rest-api` | Express.js TypeScript/ESM, middleware, Zod validation, error handling | [SKILL.md](../../skills/express-rest-api/SKILL.md) |
| `nodejs-express-server` | Express.js: JWT auth, routing, env config, error handling | [SKILL.md](../../skills/nodejs-express-server/SKILL.md) |
| `nodejs-backend-patterns` | Node.js backend: middleware, error handling, DB integration | [SKILL.md](../../skills/nodejs-backend-patterns/SKILL.md) |
| `nodejs-best-practices` | Node.js principles: async patterns, security, architecture | [SKILL.md](../../skills/nodejs-best-practices/SKILL.md) |
| `prisma-database-setup` | SQLite database schema, migrations v6, queries | [SKILL.md](../../skills/prisma-database-setup/SKILL.md) |
| `prisma-client-api` | Prisma Client queries: CRUD, filters, relations, transactions | [SKILL.md](../../skills/prisma-client-api/SKILL.md) |
| `prisma-cli` | Prisma CLI commands: migrate, db push, generate, studio | [SKILL.md](../../skills/prisma-cli/SKILL.md) |
| `ai-sdk` | Vercel AI SDK v6 backend: tool calling, streaming, provider-agnostic | [SKILL.md](../../skills/ai-sdk/SKILL.md) |
| `xlsx` | Excel generation with SheetJS (TypeScript) from Prisma data | [SKILL.md](../../skills/xlsx/SKILL.md) |

### Global Skills (also in root AGENTS.md)

| Skill | Description |
|-------|-------------|
| `typescript` | Const types, flat interfaces, utility types, Zod type inference |
| `typescript-advanced-types` | Advanced TS: generics, conditional types, mapped types |
| `vitest` | Vitest testing: config, mocking, snapshots, coverage |
| `git-commit` | Conventional Commits |
| `zod-4` | Zod v4 schemas, Express validation, v3 to v4 migration |
| `zod` | Zod patterns: parse, refine, performance, error handling |
| `skill-creator` | Skill creation patterns |

### Auto-invoke Skills

When performing these actions, ALWAYS invoke the corresponding skill FIRST:

| Action | Skill |
|--------|-------|
| Defining database models or migrations | `prisma-database-setup` |
| Creating API endpoints or middleware | `express-rest-api` |
| Validating incoming data/request bodies | `zod-4` |
| Integrating AI/LLM calls or tool calling | `ai-sdk` |
| Generating reports (Excel) | `xlsx` |
| Creating git commit | `git-commit` |
| Refactoring TypeScript code | `typescript` |
| Writing or running tests | `vitest` |
| Querying database with Prisma | `prisma-client-api` |
| Running Prisma CLI commands | `prisma-cli` |

---

## HTTP Client Policy

**IMPORTANTE:** NO utilizar `axios`. Utilizar el `fetch` nativo de Node.js (disponible en v18+) o `undici` para peticiones HTTP.

---

## Project Overview

Tatachio Mirabel Backend is an application to manage cabildo members and generate government-standard reports.

| Component | Location | Tech Stack |
|-----------|----------|------------|
| Backend | `src/` | Node.js, Express, TypeScript, Prisma |
| Documentation | `docs/` | Planning and specs |

---

## Commit & Pull Request Guidelines

Follow conventional-commit style: `<type>[scope]: <description>`

**Types:** `feat`, `fix`, `docs`, `chore`, `perf`, `refactor`, `style`, `test`

**Importante:** Todas las instalaciones de dependencias deben realizarse con `pnpm`, no con `npm` ni `yarn`.

Before creating a PR:
1. Complete checklist in `.github/pull_request_template.md` (if exists)
2. Run all relevant tests and linters
