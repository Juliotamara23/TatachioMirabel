# QA Plan — Tatachio Mirabel

## Visión

Un toolkit de QA determinista, cross-platform, que un sub-agente pueda ejecutar de principio a fin. Tres capas independientes, una sola fuente de verdad (OpenAPI). El humano puede importar la misma spec en Postman/Insomnia y tener toda la API documentada con ejemplos listos para probar.

---

## Separación de responsabilidades

| Capa | Qué prueba | Ubicación | Herramienta | Quién la corre |
|---|---|---|---|---|
| **Backend** | Lógica interna, controladores, Prisma, middleware | `apps/backend/tests/` | Vitest | `pnpm --filter @tatachio/backend test` |
| **API (black-box)** | Endpoints reales vía HTTP. Auth, CRUD, scoping, chat. No importa código del backend. | `scripts/qa/suites/api/` | Node.js + fetch nativo | `scripts/qa/run-api.mjs` |
| **CLI** | Simulación de usuario real usando el CLI como cliente de la API | Sub-agente dedicado | Skill `qa-flow` | Delegación del orchestrator |
| **Chaos** | Injection, auth bypass, rate-limit, boundary, concurrencia | `scripts/qa/suites/chaos/` | Node.js + fetch nativo | `scripts/qa/run-chaos.mjs` |
| **Futuro: Frontend** | UI, flujos de usuario, PWA offline | A definir en Fase 2/3 | Playwright / Vitest browser mode | A definir |

**Regla:** los tests de backend NO se mueven. Están co-localizados con el código que prueban. Los tests de API black-box son consumidores externos — van en `scripts/qa/`.

---

## Single Source of Truth: OpenAPI

```
specs/
└── openapi.yaml          ← Define toda la API REST
                            (paths, schemas, auth, ejemplos, errores)
```

De este archivo se derivan:

| Consumidor | Cómo |
|---|---|
| **Tests API black-box** | `lib/spec-reader.mjs` parsea el YAML y alimenta los scripts de test |
| **Postman** | File → Import → `openapi.yaml` (nativo, cero código) |
| **Insomnia** | File → Import → `openapi.yaml` (nativo, cero código) |
| **Documentación** | Swagger UI / Scalar / Redoc (a futuro) |
| **Validación runtime** | `express-openapi-validator` (a futuro, opcional) |
| **Tipos TypeScript** | `openapi-typescript` (a futuro, opcional) |

---

## Estructura del toolkit

```
scripts/qa/
├── run-all.mjs                    # Orquestador principal
├── run-api.mjs                    # Solo tests black-box
├── run-chaos.mjs                  # Solo chaos/error
│
├── lib/
│   ├── server.mjs                 # startServer(puerto), stopServer(), resetDb()
│   ├── reporter.mjs               # Genera qa-report.json estructurado
│   └── spec-reader.mjs            # Lee openapi.yaml → endpoints, schemas, ejemplos
│
├── suites/
│   ├── api/                       # Black-box tests por dominio
│   │   ├── auth.test.mjs          # POST /api/auth/login, /api/auth/register
│   │   ├── miembros.test.mjs      # CRUD /api/miembros
│   │   ├── familias.test.mjs      # CRUD /api/familias
│   │   ├── cabildos.test.mjs      # CRUD /api/cabildos
│   │   ├── chat.test.mjs          # POST /api/chat + SSE streaming
│   │   └── admin.test.mjs         # Admin endpoints (capitana assignment)
│   │
│   └── chaos/                     # Intentan romper la API
│       ├── auth-bypass.test.mjs   # JWT manipulado, token expirado, sin token
│       ├── injection.test.mjs     # SQL injection, XSS, payloads malformados
│       ├── rate-limit.test.mjs    # 429s, Retry-After, concurrencia
│       └── boundary.test.mjs      # Payloads enormes, unicode extremo, nulls
│
└── qa-agent.skill.md              # Instrucciones para el sub-agente QA
```

---

## Flujo del agente QA

```
1. resetDb()           → prisma db push + seed limpio
2. startServer()       → backend corriendo en puerto dinámico
3. run-api.mjs         → todos los tests black-box
4. run-chaos.mjs       → injection, bypass, rate-limit, boundary
5. stopServer()        → mata el proceso
6. reporter.mjs        → qa-report.json
                           - total tests, pass/fail/skip
                           - cobertura por endpoint
                           - gaps detectados
                           - veredicto: PASS / WARN / BLOCKED
7. mem_save            → resultado en Engram para trazabilidad
```

El agente QA recibe el rol vía skill `qa-flow`, ejecuta `node scripts/qa/run-all.mjs`, analiza `qa-report.json`, y emite veredicto.

---

## Reporte (qa-report.json)

```json
{
  "timestamp": "2026-07-31T...",
  "commit": "abc1234",
  "summary": {
    "total": 45,
    "passed": 42,
    "failed": 2,
    "skipped": 1,
    "duration_ms": 12345
  },
  "verdict": "WARN",
  "by_suite": {
    "api/auth": { "passed": 8, "failed": 0 },
    "api/miembros": { "passed": 10, "failed": 1 },
    "chaos/auth-bypass": { "passed": 6, "failed": 0 }
  },
  "coverage": {
    "endpoints_tested": 18,
    "endpoints_total": 20,
    "untested": ["GET /api/models", "DELETE /api/admin/..."],
    "error_paths_tested": 12
  },
  "failures": [
    {
      "suite": "api/miembros",
      "test": "GET /api/miembros/:id con id inexistente → 404",
      "expected": 404,
      "actual": 500,
      "detail": "Internal server error en vez de 404"
    }
  ]
}
```

---

## TODO — Implementación

### Fase 0: Fixtures y datos de prueba
- [x] `generate-fixtures.mjs` — script generador con PRNG determinista (seed 2026)
- [x] `fixtures/seed.json` — 1000 miembros, ~200 familias, 3 cabildos, 50 altas
- [x] `lib/seed-db.mjs` — lee `seed.json` y popula `qa.db` via Prisma Client (excepcion consciente: infraestructura, no testing)

### Fase 1: Infraestructura base
- [x] Crear estructura `scripts/qa/`
- [x] `lib/server.mjs` — spawn `pnpm dev` en puerto dinamico, health check, teardown
- [x] `lib/reporter.mjs` — genera `qa-report.json` + JUnit XML
- [x] Smoke test: `suites/api/health.test.mjs` — login → 200, server vivo
- [x] Judgment Day: 2 jueces, 8 WARNING corregidos, smoke test PASS

### Fase 2: OpenAPI spec (deferred — post-infra)
- [ ] Generar `specs/openapi.yaml` desde codigo con `zod-to-openapi` + route scanning
- [ ] Validar import en Postman e Insomnia
- [ ] Evaluar `lib/spec-reader.mjs` solo si el OpenAPI generado lo justifica

### Fase 3: Tests API black-box
- [x] `suites/api/auth.test.mjs` — login, register, models (~15 tests)
- [x] `suites/api/miembros.test.mjs` — CRUD + cabildo scoping (~17 tests)
- [x] `suites/api/familias.test.mjs` — CRUD + scoping (~16 tests)
- [x] `suites/api/cabildos.test.mjs` — CRUD + auth gates (~22 tests)
- [x] `suites/api/chat.test.mjs` — chat, SSE, prompt injection (~10 tests)
- [x] `suites/api/admin.test.mjs` — captain assignment, role isolation (~10 tests)

### Fase 4: Chaos testing
- [x] `suites/chaos/auth-bypass.test.mjs` — JWT tampering, fake tokens (9 tests)
- [x] `suites/chaos/injection.test.mjs` — SQL injection, XSS, path traversal (34 tests)
- [x] `suites/chaos/rate-limit.test.mjs` — 429 bursts, Retry-After (5 tests)
- [x] `suites/chaos/boundary.test.mjs` — tipos mal, vacios, concurrencia (10 tests)

### Fase 5: Orquestador + Skill QA
- [x] `run-all.mjs` — flujo completo: resetDb → server → api tests → chaos → report → stop
- [x] `qa-agent.skill.md` — rol del sub-agente + mini referencia de patrones
- [x] Validar flujo (prueba de fuego) — destapo bugs reales en backend + suites

### Fase 6: Contract-driven QA (de-hardcodear suites)
> La prueba de fuego destapo que las suites hardcodean expectativas en vez de leer el contrato real.
> Regla central: el QA es cliente externo via HTTP, pero sus EXPECTATIVAS vienen de `specs/openapi.yaml`.
> Cuando el backend cambia el contrato → actualizar OpenAPI → QA se adapta solo. Cero escritura duplicada.

**Borrar**
- [ ] `run-api.mjs` — inlinea los 7 API suites, duplica a run-all
- [ ] `run-chaos.mjs` — duplica a run-all

**Crear**
- [ ] `lib/spec-reader.mjs` — lee specs/openapi.yaml → endpoints, status codes, auth
- [ ] `lib/suite-runner.mjs` — lifecycle compartido (seed/server/test/report)
- [ ] `lib/test-utils.mjs` — helpers (test(), loginAdmin(), request())

**Cambiar**
- [ ] `suites/api/*.test.mjs` (7) — de-hardcodear, leer contrato del OpenAPI
- [ ] `suites/chaos/*.test.mjs` (4) — igual
- [ ] `lib/server.mjs` — limpiar useDev hardcodeado

**Validar**
- [x] Fire test pasa limpio con contract-driven (8 suites PASS, 6 fallos = bugs reales backend)
- [ ] Fix backend 500→404 se refleja solo en QA (openapi.yaml updated)

### Fase 7: QA CLI (simular usuario real con el CLI)
> El CLI consume la misma API. El QA de API cubre la API; esta fase cubre el CLI como interfaz:
> ejecutar el binario real contra el server QA y validar su output.

**Crear**
- [ ] `lib/cli-utils.mjs` — helpers: runCli(args, { env }), login via CLI, parse JSON output
- [ ] `suites/cli/auth.test.mjs` — login correcto/incorrecto, logout
- [ ] `suites/cli/miembros.test.mjs` — list/get/create/update (--json)
- [ ] `suites/cli/familias.test.mjs` — list/get
- [ ] `suites/cli/cabildos.test.mjs` — list/get
- [ ] `suites/cli/chat.test.mjs` — chat (si aplica, condicional a AI)

**Reglas**
- Apunta al server QA (TATACHIO_BASE_URL = port dinamico) → qa.db aislada
- Usa `suite-runner.mjs` para seed + server
- Valida output JSON estructurado (modo `--json` del CLI)
- NUNCA toca mirabel.db

**Validar**
- [ ] Correr `run-all.mjs` incluye las suites CLI
- [ ] Sub-agente simula usuario CLI contra QA (flujo completo)

---

## Decisiones tomadas

| Decisión | Razón |
|---|---|
| Scripts en Node.js, no bash | Cross-platform (Windows/Linux/Mac). Cero dependencias de shell. |
| Tests de backend se quedan en `apps/backend/tests/` | Co-localizacion con el codigo fuente. Son unit/integration, no black-box. |
| `fetch` nativo, sin axios/undici | Politica del proyecto. Node.js 18+ lo tiene built-in. |
| Postman/Insomnia = export para humanos, no para agentes | Los agentes leen `qa-report.json`. Los humanos importan `openapi.yaml`. |
| **Seed via Prisma Client directo** | Es infraestructura, no testing. Mismo patron que `tests/setup.ts`. Endpoint de seed seria sobre-ingenieria. |
| **Server via spawn, no import** | Black-box puro. Evita acoplamiento a TS/ESM/config del backend. Cold start aceptable (~3s). |
| **OpenAPI generado desde codigo** | `zod-to-openapi` + route scanning. Hand-write 20+ endpoints se desincroniza en dias. |
| **QA DB en `scripts/qa/qa.db`** | Aislado del backend. Se crea y destruye por run. |
| **`spec-reader.mjs` diferido** | Complejidad innecesaria en Fase 1. Endpoints se hardcodean en cada suite. |
| **Prompt-injection dentro de `chat.test.mjs`** | Solo afecta un endpoint. No justifica suite separada. |
| **Veredicto: PASS (0 fallos) / WARN (>0, no criticos) / BLOCKED (server no arranca, auth roto)** | Umbrales explicitos. Sin numeros magicos. |
