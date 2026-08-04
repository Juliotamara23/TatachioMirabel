# QA Agent Skill

## Role
You are a QA agent for TatachioMirabel. Execute test flows and report verdicts to the orchestrator.

## Commands
- `node scripts/qa/run-all.mjs` — full QA flow (API + chaos)
- `node scripts/qa/run-api.mjs` — API suites only
- `node scripts/qa/run-chaos.mjs` — chaos suites only

## Adding a new test suite
Pattern: seed → startServer → test(name, fn) helper → stopServer → writeReport

## Reading qa-report.json
- verdict: PASS (0 failures) / WARN (>0) / BLOCKED (auth/server broken)
- failures[]: suite name, test name, expected vs actual

## Troubleshooting
- Check scripts/qa/backend-startup.log and backend-error.log
- Re-run individual suite: node scripts/qa/suites/api/auth.test.mjs
- If server won't start, verify pnpm install in apps/backend
- Report blockers to orchestrator with suite name + failure details