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
- [ ] `lib/seed-db.mjs` — lee `seed.json` y popula la base de datos via Prisma

### Fase 1: Infraestructura base
- [x] Crear estructura `scripts/qa/`
- [ ] `lib/server.mjs` — start, stop, resetDb (crea DB fresca, seed, levanta Express)
- [ ] `lib/reporter.mjs` — genera `qa-report.json` estructurado

### Fase 2: OpenAPI spec
- [ ] Relevar todos los endpoints actuales del backend
- [ ] Escribir `specs/openapi.yaml` (paths, schemas, auth, ejemplos)
- [ ] Validar que Postman e Insomnia lo importan correctamente

### Fase 3: Tests API black-box
- [ ] `lib/spec-reader.mjs` — parsea `openapi.yaml` y alimenta los tests
- [ ] `suites/api/auth.test.mjs`
- [ ] `suites/api/miembros.test.mjs`
- [ ] `suites/api/familias.test.mjs`
- [ ] `suites/api/cabildos.test.mjs`
- [ ] `suites/api/chat.test.mjs`
- [ ] `suites/api/admin.test.mjs`

### Fase 4: Chaos testing
- [ ] `suites/chaos/auth-bypass.test.mjs`
- [ ] `suites/chaos/injection.test.mjs` (SQL injection, XSS)
- [ ] `suites/chaos/prompt-injection.test.mjs` — jailbreaks, system prompt override, tool abuse via chat
- [ ] `suites/chaos/rate-limit.test.mjs`
- [ ] `suites/chaos/boundary.test.mjs`

### Fase 5: Orquestador + Skill QA
- [ ] `run-all.mjs`
- [ ] `run-api.mjs`
- [ ] `run-chaos.mjs`
- [ ] `qa-agent.skill.md`
- [ ] Validar flujo completo con sub-agente real

---

## Decisiones tomadas

| Decisión | Razón |
|---|---|
| Scripts en Node.js, no bash | Cross-platform (Windows/Linux/Mac). Cero dependencias de shell. |
| Tests de backend se quedan en `apps/backend/tests/` | Co-localización con el código fuente. Son unit/integration, no black-box. |
| OpenAPI como fuente única | Estándar de industria. Postman/Insomnia lo importan nativo. Tipos generables. Documentación auto-generable. |
| `fetch` nativo, sin axios/undici | Política del proyecto. Node.js 18+ lo tiene built-in. |
| Sin dependencias nuevas en fase inicial | `newman`, `hurl`, etc. se evalúan después si hay necesidad. |
| Postman/Insomnia = export para humanos, no para agentes | Los agentes leen `qa-report.json`. Los humanos importan `openapi.yaml`. |
