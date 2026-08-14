# CLI Guidelines

## How to Use This Guide

- Start here for CLI-specific norms. See root [AGENTS.md](../../AGENTS.md) for cross-project norms and global skills.
- The CLI shares the backend stack (Node.js, TypeScript, ESM, `fetch` nativo, Vitest, pnpm). When a convention is not CLI-specific, follow the root guide.
- All skills live in `skills/` at the project root.

## Available Skills

Use these skills for detailed patterns on-demand.

### CLI-Specific Skills

| Skill | Description | URL |
|-------|-------------|-----|
| `vitest` | Testing: config, mocking (MSW), snapshots, coverage | [SKILL.md](../../skills/vitest/SKILL.md) |
| `zod-4` | Zod v4 schemas consumed from `@tatachio/shared` | [SKILL.md](../../skills/zod-4/SKILL.md) |

### Global Skills (also in root AGENTS.md)

| Skill | Description |
|-------|-------------|
| `typescript` | Const types, flat interfaces, utility types, Zod type inference |
| `typescript-advanced-types` | Advanced TS: generics, conditional types, mapped types |
| `git-commit` | Conventional Commits |
| `zod` | Zod patterns: parse, refine, performance, error handling |

### Auto-invoke Skills

When performing these actions, ALWAYS invoke the corresponding skill FIRST:

| Action | Skill |
|--------|-------|
| Writing or running tests | `vitest` |
| Creating git commit | `git-commit` |
| Refactoring TypeScript code | `typescript` |
| Validating data or request bodies | `zod-4` |

---

## HTTP Client Policy

**IMPORTANTE:** NO utilizar `axios`. Utilizar el `fetch` nativo de Node.js (disponible en v18+) o `undici` para peticiones HTTP. All API calls go through `src/api/client.ts` (`apiFetch`), which handles auth header, JSON serialization, and `ApiError` with `status` + `body`.

---

## CLI Conventions

- **Commands:** Defined with Commander.js (`src/index.ts` wires top-level commands; each resource exposes a `setupXCommand` that registers subcommands in `src/commands/`).
- **Interactive prompts:** Use `@inquirer/prompts` only outside pipe mode. Do not prompt when stdin is piped.
- **Output mode:** `OutputMode = "pretty" | "json"`. Default is `json` when piped, `pretty` otherwise. Respect a `--json` flag on each command.
- **Config:** Stored in `~/.tatachio/config.json` with mode `0o600`. Never print the token to logs. Env overrides: `TATACHIO_TOKEN`, `TATACHIO_BASE_URL`.
- **Structure:** `src/api/` (HTTP layer), `src/commands/` (command handlers), `src/display.ts` (output helpers + exit codes), `src/config.ts` (config file access).
- **Tests:** Vitest. Unit tests cover pure helpers (client, display, config); integration tests use MSW to mock the backend API. Do not hit a live server in tests.

---

## Project Overview

Tatachio Mirabel CLI is an admin interface for the Tatachio backend (cabildo member management and reports). The CLI exposes server tools only (`login`, `logout`, `miembros`, `familias`, `cabildos`); chat happens in OpenCode (which invokes these CLI tools) and in the web.

| Component | Location | Tech Stack |
|-----------|----------|------------|
| CLI | `src/` | Node.js, TypeScript, Commander.js, @inquirer |
| Tests | `tests/` | Vitest, MSW |

---

## Commit & Pull Request Guidelines

Follow conventional-commit style: `<type>[scope]: <description>`

**Types:** `feat`, `fix`, `docs`, `chore`, `perf`, `refactor`, `style`, `test`

**Importante:** Todas las instalaciones de dependencias deben realizarse con `pnpm`, no con `npm` ni `yarn`.

Before creating a PR:
1. Complete checklist in `.github/pull_request_template.md`
2. Run all relevant tests and linters (`pnpm --filter @tatachio/cli test`)
