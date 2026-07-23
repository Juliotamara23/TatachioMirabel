# Repository Guidelines

## How to Use This Guide

- Start here for cross-project norms. TatachioMirabel-V1 is a Node.js/TypeScript Express backend.
- Component docs override this file when guidance conflicts.

## Available Skills

Use these skills for detailed patterns on-demand. All skills are in `apps/backend/skills/`.

### Core Skills
| Skill | Description |
|-------|-------------|
| `typescript` | Const types, flat interfaces, utility types, Zod type inference |
| `typescript-advanced-types` | Advanced TS: generics, conditional types, mapped types |
| `prisma-database-setup` | SQLite database schema, migrations v6, queries |
| `prisma-cli` | Prisma CLI commands: migrate, db push, generate, studio |
| `prisma-client-api` | Prisma Client queries: CRUD, filters, relations, transactions |
| `express-rest-api` | Express.js TypeScript/ESM, middleware, Zod validation, error handling |
| `nodejs-express-server` | Express.js: JWT auth, routing, env config, error handling |
| `nodejs-backend-patterns` | Node.js backend: middleware, error handling, DB integration |
| `nodejs-best-practices` | Node.js principles: async patterns, security, architecture |
| `ai-sdk` | Vercel AI SDK v6 backend: tool calling, streaming, provider-agnostic |
| `zod-4` | Zod v4 schemas, Express validation, v3→v4 migration |
| `zod` | Zod patterns: parse, refine, performance, error handling |
| `xlsx` | Excel generation with SheetJS (TypeScript) from Prisma data |
| `vitest` | Vitest testing: config, mocking, snapshots, coverage |
| `git-commit` | Conventional Commits |
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
