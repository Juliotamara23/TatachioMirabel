---
name: qa
description: "Trigger: QA, tests, correr pruebas, run-all, E2E, Playwright, chaos, verificar suite, ejecutar tests del proyecto. Run and extend Tatachio Mirabel's full QA flow: orchestrator suites, disposable-data isolation, autonomous web E2E, and chaos scenarios."
license: Apache-2.0
metadata:
  author: "Juliotamara23"
  version: "1.0"
---

# QA — Tatachio Mirabel Testing Flow

## Activation Contract

Load this skill when running, writing, or extending any test suite in this repo: the `run-all.mjs` orchestrator, API/CLI/chaos suites under `scripts/qa/suites/`, the web E2E Playwright suite under `scripts/qa/suites/web/`, or vitest unit tests in apps.

## Hard Rules

- **NEVER modify code or specs while running QA.** If a test fails because the set is broken (wrong fixture data, ambiguous locator, contract mismatch), STOP and REPORT the defect with evidence. Only implement the fix after explicit user approval. A QA run that "fixes" itself is a broken set.
- **Disposable data always**: QA exercises the REAL backend/CLI but ALWAYS against isolated `QA_HOME` (fake `$HOME` + `TATACHIO_REPORTES_DIR`) + `qa.db`. Never touch `~/.tatachio`, `mirabel.db`, or production artifacts. Principle: **test → report → destroy**. Before pushing, run `node scripts/qa/cleanup.mjs` (or rely on pre-push hook: `git config core.hooksPath .githooks`).
- **Web E2E is fully autonomous**: `playwright.config.ts` boots its OWN QA backend on **fixed port 3456** (seeded qa.db, isolated env) + frontend build/preview on **5173 --strictPort** with `reuseExistingServer: false`. It NEVER talks to dev servers (3000/5173). If a dev server occupies 5173, the run fails by design — stop it first.
- **E2E makes real HTTP requests** — no mocks. Login uses `page.request.post` against `http://localhost:3456/api/auth/login`; CRUD and chaos hit the real QA backend. Mocks exist only in vitest unit tests.
- Headed on local (`headless: !!process.env.CI`), screenshots/traces/video **off** by default. In WSL without a visible display, record video via `playwright.video.config.ts` (workers 1, `outputDir` to a Windows path like `/mnt/e/MediaProyects/web-e2e-demo`).
- Playwright's webServer may leave a detached `tsx src/index.ts` on 3456 after runs. Before rerunning: `pkill -f "tsx src/index.ts"; pkill -f start-web-backend; sleep 1` and confirm `ss -tlnp | grep 3456` is empty (use `kill -9 <pid>` if needed).

## Decision Gates

| Task | Action |
|------|--------|
| Run the full API/CLI/chaos suites | `node scripts/qa/run-all.mjs` (backend dynamic ports 3500+, seeded once) |
| Run web E2E suite | `pnpm --filter frontend test:e2e` (autonomous, port 3456 + 5173) |
| Run unit tests (backend) | `pnpm --filter backend test` |
| Run unit tests (frontend) | `pnpm --filter frontend test` |
| Record E2E video for WSL | `pnpm --filter frontend exec playwright test --config=../../scripts/qa/suites/web/playwright.video.config.ts` |
| Test fails with broken set | Report defect; do NOT edit specs/code without approval |

## Execution Steps

1. Identify scope: unit (vitest), orchestrator suites, or web E2E — see Decision Gates.
2. Ensure ports free: 3456/5173 (web E2E), 3500+ range (orchestrator). Kill leftovers first.
3. Run the target suite and capture the summary (`passed/failed`, counts).
4. On failure: classify — environment/infra vs broken test set vs real contract bug. Report evidence (error context, status codes), never silently patch.
5. After runs: verify no stray processes and no leaked artifacts; leave `test-results/` and `playwright-report/` ignored (they are in .gitignore).

## Output Contract

Return: suites run, pass/fail counts per suite, defects found (with evidence), any environment issues (ports, leftover processes), and recommended follow-ups. Never include unapproved code edits.

## References

- `scripts/qa/run-all.mjs` — orchestrator (17 suites, seed-once, sequential).
- `scripts/qa/lib/server.mjs` — QA backend lifecycle (ports, health check, process group kill).
- `scripts/qa/lib/start-web-backend.mjs` — autonomous web E2E backend on 3456.
- `scripts/qa/suites/web/playwright.config.ts` — web E2E config (isolation contract).
- `scripts/qa/fixtures/seed.json` — seed data (admin@tatachio.com / admin123, cabildos, CAPTAIN users).
- `apps/backend/tests/` + `apps/frontend/src/**/*.test.tsx` — vitest unit tests.
