# Plan del Proyecto: Tatachio Mirabel Backend

## Objetivo General

Backend para gestionar los datos censales del Cabildo Tatachio Mirabel, con una interfaz de **chat IA como centro de operaciones** (tool calling sobre la base de datos), un **CLI como interfaz principal del admin**, y una versión mobile-first para la capitana.

## Stack Tecnológico

| Componente | Tecnología |
|---|---|
| Lenguaje | TypeScript |
| Entorno | Node.js |
| Framework | Express.js |
| ORM | Prisma |
| Base de Datos | **SQLite** (único — no PostgreSQL) |
| Validación | Zod |
| IA | Vercel AI SDK (provider agnóstico — OpenAI, Google, Anthropic, Ollama, etc.) |
| CLI Admin | Cliente de terminal (Node.js/Go) contra la API REST |

## Arquitectura: Agentic API

```
             ┌──────────────────────────────────────────────┐
             │              Backend (Express)                │
             │                                              │
             │  POST /api/chat ──→ LLM ──→ tools[] ──→ DB   │
             │  POST /api/auth         ↑                     │
             │  GET  /api/reportes     │  Tool calling       │
             │                         │  sobre la BD        │
             └─────────────────────────┼──────────────────────┘
                                       │
          ┌───────────────┬────────────┴────────────┬──────────────┐
          ▼               ▼                         ▼              ▼
       CLI Admin     Web Admin (Fase 2)      Capitana Mobile    curl/API
     (Fase 1)           (opcional)          (Fase 3, PWA)

────────────────────────────────────────────────────────────────────
                        SQLite (un archivo)
```

### Clientes

| Cliente | Usuario | Prioridad | Descripción |
|---|---|---|---|---|
| **CLI** | ADMINISTRATOR | Fase 1 ✅ | Terminal: login + comandos CRUD (sin chat). Interfaz principal del admin, usable desde OpenCode. |
| **Web** | Admin | Fase 2 | Paneles, dashboards, CRUD visual. Opcional. |
| **PWA Mobile** | Capitana | Fase 3 | Interfaz tipo chat, mobile-first, offline-first (caché IndexedDB). |

El chat IA (tool calling) es el centro de operaciones para la conversación natural; el REST es la superficie de datos que sirve al CLI, al web admin y al toolkit de QA:

- `POST /api/auth/login` — autenticación (JWT)
- REST CRUD completo: `miembros`, `familias`, `cabildos` + endpoints admin de asignación de capitanas
- `POST /api/chat` — el core del negocio (chat IA con tool calling)
- `GET /api/models` — listado de modelos disponibles
- `GET /api/reportes/censo.xlsx` — descarga del Excel censal

## Decisiones Arquitectónicas

- **SQLite es definitivo.** No hay migración a PostgreSQL. El proyecto se usa ~3 meses al año, no justifica costo ni complejidad. SQLite permite: backup = copiar archivo, deploy = cualquier VPS de $5 o incluso localhost durante la temporada activa.
- **Tool calling sobre la DB.** No RAG para datos operativos. Las consultas van directo a SQLite vía Prisma. Es más barato (sin embeddings), más preciso (datos concretos no se alucinan) y permite writes controlados.
- **Sin costos de infraestructura.** Sin VPS fijo, sin servicios cloud pagados. El backend corre bajo demanda durante la temporada de trabajo censal.
- **Dos roles (en inglés):**
  - **ADMINISTRATOR**: acceso total (CRUD completo), CLI + web.
  - **CAPTAIN**: lectura + creación + edición de miembros. Scoped a un solo cabildo vía JWT. No puede eliminar registros ni ver otros cabildos.
- **CLI como cliente de servidor.** El CLI expone solo comandos de servidor — `login`, `logout`, `miembros`, `familias`, `cabildos` — tipo `gh` o `gcloud`. La conversación con el LLM ocurre en OpenCode (que invoca las tools del CLI) y en la web. Autenticación vía JWT (login o variable de entorno).
- **LLM provider-agnóstico.** El stack de IA (Vercel AI SDK) permite usar cualquier proveedor sin cambiar el código: OpenAI, Google Gemini, Anthropic, Ollama, etc.
- **PWA offline-first para Capitana.** La capitana accede vía PWA con caché local (IndexedDB). En modo conectado sincroniza con el backend. En modo offline consulta los datos cacheados. Sin dependencia de internet permanente.

## Estado Real del Proyecto

Estado: **backend + CLI estables y verificados** (Fases 0.1, 0.2, 0.3, 1A, 1B, 1C, 1D ✅). Pendiente: Fases 2 y 3 (frontend — próxima discusión de diseño).

### ✅ Fase 0.1 — Fundamentos (Completo)
- [x] Configuración del monorepo (pnpm workspace)
- [x] Prisma + SQLite con todos los modelos
- [x] Express + TypeScript corriendo
- [x] Base de datos funcional con datos de prueba

### ✅ Fase 0.2 — Auth + CRUD (Completo)
- [x] Auth JWT (register/login) probado y funcionando
- [x] CRUD de Miembros completo con Zod
- [x] CRUD de Cabildo y Familia (completado en Fase 1A)
- [x] Middleware de autenticación y roles (`isAdmin` + `isCapitana`)
- [x] Rol Capitana implementado con scope de cabildo (Fase 1D)
- [x] Error handler global (middleware centralizado con respuestas JSON)

### ✅ Fase 0.3 — Motor IA (Completo, probado con providers reales)
- [x] Vercel AI SDK con Gemini + Ollama
- [x] Sistema de fallback automático (Vercel AI Gateway, ver Fase 1B)
- [x] Esquema Zod para salida estructurada
- [x] Probado end-to-end con providers reales: Ollama local vía endpoint compatible OpenAI; Gemini/DeepSeek/Llama vía cadena de failover del Vercel AI Gateway

## Roadmap

### ✅ Fase 1A — Backend: huecos y estabilidad
Prioridad: **alta** — prerrequisito para todo lo demás.

- [x] CRUD de Cabildo (rutas, controlador, validación Zod)
- [x] CRUD de Familia (rutas, controlador, validación Zod)
- [x] Error handler global (middleware centralizado con respuestas JSON)
- [x] Refactor de permisos: middleware `isAdmin` + `isCapitana` según modelo de roles definido
- [x] Script de seed con datos de prueba representativos (múltiples familias, miembros)
- [x] Cargar datos reales desde Excel a SQLite (script de migración única, no feature)

### ✅ Fase 1B — Backend: Chat IA con tool calling
Prioridad: **alta** — el core del producto.

- [x] Probar y afinar el servicio de IA con un provider real (Gemini 3.1 Flash Lite)
- [x] Definir tools disponibles: `searchMiembros`, `getMiembroById`, `getFamiliaMembers`, `getCabildoStats`, `getReporteData`
- [x] Endpoint `POST /api/chat`:
  - Autenticación JWT
  - Tool calling con Prisma (lectura)
  - System prompt con contexto del cabildo
  - Respuesta en texto natural + SSE streaming
- [x] Rate limiting por rol (Admin: 60/min, Capitana: 20/min)
- [x] GET `/api/models` — listado de modelos disponibles
- [x] Model registry data-driven: `EXTRA_PROVIDERS_JSON` (JSON inline) > `PROVIDERS_CONFIG_PATH` (archivo) > `config/providers.json` por defecto — agregar un proveedor OpenAI-compatible nuevo requiere **cero código** (solo API key + baseURL + modelos en config)
- [x] Failover con Vercel AI Gateway (`AI_GATEWAY_API_KEY`): cuando la key está seteada, todo el tráfico pasa por `createGateway`; cadena curada google → deepseek → meta con `gemini-3.1-flash-lite-preview` / `deepseek-r1` / `llama-3.3-70b` (`apps/backend/src/services/failoverChain.ts`)
- [x] Ollama vía endpoint compatible OpenAI (`@ai-sdk/openai`) — el antiguo `ollama-ai-provider` era incompatible con `ai@6` y fue reemplazado

### ✅ Fase 1C — CLI Admin
Prioridad: **alta** — interfaz principal del admin. **COMPLETO.**

- [x] Cliente de terminal como paquete independiente (`apps/cli/`)
- [x] Autenticación: `login` (cachea token) o leer `TATACHIO_TOKEN` de env
- [x] Comandos CRUD directos (sin LLM): `miembros list`, `miembros get`, `miembros create`, `miembros update`, `miembros delete`, `familias list`, `cabildos list`
- [x] Modo pipe: entradas y salidas en JSON para scripts y agentes
- [x] 68 tests vitest (unit + integración) + suites QA CLI (42 tests black-box) — ESLint limpio, build limpio
- [x] Stack: Commander.js + @inquirer/prompts + native fetch
- [x] Subcomando `chat` eliminado (PR #53) — la conversación IA vive en la web y en OpenCode
- [x] `miembros delete` añadido (PR #54)
- [x] Cobertura de exit codes 5xx (PR #56)
- [x] PRs #12, #53, #54, #56 merged

### ✅ Fase 1D — Backend: Scope de Cabildo para Capitanas
Prioridad: **alta** — data isolation. **COMPLETO.**

- [x] JWT extendido con `cabildoId: string | null`
- [x] Login resuelve cabildo desde `UsuarioCabildo` (CAPTAIN = 1 cabildo exacto)
- [x] `applyCabildoScope(req, where)` — scoping automático en todos los controladores
- [x] Admin endpoints: `POST/DELETE /api/admin/cabildos/:id/captains/:uid`
- [x] Register requiere `cabildoId` para CAPTAIN
- [x] Roles renombrados a inglés: `CAPTAIN` + `ADMINISTRATOR`
- [x] 255 tests backend (253 pasados, 2 skipped), ESLint limpio
- [x] PR #13 merged

### Fase 2 — Frontend Admin (Web)
Prioridad: **media** — interfaz web complementaria al CLI.
**Estado: pendiente de diseño — próxima discusión.**

- [ ] Login
- [ ] Panel de chat IA
- [ ] Paneles de consulta (Miembros, Familias, Cabildos)
- [ ] CRUD visual para administración
- [ ] Descarga de reportes Excel

### Fase 3 — Frontend Capitana (Mobile)
Prioridad: **media** — PWA offline-first, tipo chat.
**Estado: pendiente de diseño — próxima discusión.**

- [ ] PWA con Service Worker + caché IndexedDB
- [ ] Modo conectado: sincronización bidireccional con el backend
- [ ] Modo offline: consulta de datos cacheados (lectura sin conexión)
- [ ] Interfaz tipo chat (WhatsApp-like) para consultas en lenguaje natural
- [ ] Agente IA con guardrails: puede consultar, crear y editar miembros. Sin permisos de eliminación.
- [ ] Búsqueda de personas por nombre, apellido o familia
- [ ] Sin costo de infraestructura adicional (mismo backend, expuesto vía túnel temporal)

### Fase 4 — Reportes Excel (Ministerio del Interior)
Prioridad: **baja** — se necesita al final del ciclo censal.

**Arquitectura (decisión 2026-08, actualizada): un solo archivo con 3 pestañas, sin servicio externo.**
- **Template oficial**: `scripts/excel-formateador/templates/Formato Censal.xlsx` (descargado del Drive, 3 pestañas: FORMATO_CENSOS, REPORTE ALTAS, REPORTE BAJAS). El template NO se modifica — siempre se trabaja sobre una copia.
- **Script mínimo** (`scripts/excel-formateador/`): openpyxl puro (SIN pandas — la fuente es la DB, no un Excel externo). Abre el template, llena las 3 pestañas (FORMATO_CENSOS desde F7, ALTAS/BAJAS desde F2), guarda UNA copia con las 3 pestañas siempre. Preserva celdas combinadas/estilos del título institucional.
- **Backend** (Node): consulta la DB (Prisma, fuente de verdad), pasa los datos al script, devuelve el .xlsx. El admin genera desde la API (`GET /api/reportes/censo.xlsx`) o desde el CLI (`tatachio reportes generar`); ambos persisten el archivo en la carpeta compartida (ver abajo).
- **Decisión de stack verificada con evidencia**: openpyxl preserva imagen/merged/estilos; exceljs CRASHA al leer templates con imágenes (descartado). pandas no aporta (datos vienen normalizados de la DB).
- **Carpeta compartida (decisión 2026-08-14)**: `TATACHIO_REPORTES_DIR` (env) con default `~/.tatachio/reportes/`. Fuera del repo (nunca en git), se crea sola con `mkdir recursive` en runtime — cero setup para quien clone. Helper único de resolución en `@tatachio/shared` (`resolveReportesDir`), usado por backend y CLI. El reporte exitoso PERSISTE en la carpeta; la limpieza solo ocurre en fallo.

- [x] Template ministerial descargado al monorepo (`scripts/excel-formateador/templates/`)
- [x] Script formateador mínimo portado (`scripts/excel-formateador/`) — verificado con 1000 miembros reales de la DB QA
- [x] Backend: consulta DB y genera el Excel (3 pestañas) — `reporteController.generarCenso` expuesto en `GET /api/reportes/censo.xlsx` (authMiddleware + isAdmin)
- [x] CLI: comando `tatachio reportes generar` que invoca el flujo (exit 0/1/2, `--output` y `--json`)
- [x] Flujo completo validado end-to-end (suite QA api/reportes 5/5 PASS, 2026-08-14; suite cli/reportes 5/5 PASS)

### Detalle del endpoint (decisión 2026-08)

- **Endpoint**: `GET /api/reportes/censo.xlsx` — requiere auth (JWT, dato censal sensible)
- **Flujo interno** (en `reporteController.generarCenso`):
  1. Consulta DB (Prisma): censo = miembros `ACTIVO`; altas/bajas = según `novedad`/`estado`/`fechaAlta`/`fechaBaja`
  2. Mapea a estructura del template (18 col censo / 15 col altas-bajas, campos ya normalizados en schema)
  3. Escribe JSON temporal en `os.tmpdir()`
  4. Invoca el script: `spawn("python3", [formateador.py, --data tmp.json, --output tmp.xlsx])` (spawn, no execFile — evita shell injection); el `--output` apunta a la carpeta compartida
  5. `res.download()` desde la carpeta compartida (`censo-{año}.xlsx`)
  6. Éxito → el xlsx PERSISTE (solo se limpia el JSON temporal); fallo → limpieza total
- **Archivos**: `apps/backend/src/controllers/reporteController.ts` (nuevo), `apps/backend/src/routes/reportes.ts` (nuevo), `apps/backend/src/index.ts` (montar `app.use("/api/reportes", reportesRouter)`)
- **Salida**: `censo-{año}.xlsx` (nombre del archivo devuelto), 3 pestañas siempre
- **Tests**: unit del controller (mock Prisma + mock spawn) + integración del flujo real

**Nota**: el análisis de inconsistencias (repetidos, edades, muertos presuntos) NO vive en Python — el backend valida en escritura (duplicados → 409, edad >99 → `warnings[]`). El formateador solo cubre la entrega ministerial.

## QA Toolkit (`scripts/qa/`)

Suite de QA **black-box determinista** que valida el backend y el CLI contra la realidad desplegada, sin acoplarse a su implementación. Referencia: `docs/QA_plan.md`.

- **17 suites**: 8 API (`api/auth`, `api/miembros`, `api/familias`, `api/cabildos`, `api/chat`, `api/admin`, `api/reportes`, `api/health`) + 4 chaos (`chaos/auth-bypass`, `chaos/injection`, `chaos/rate-limit`, `chaos/boundary`) + 5 CLI (`cli/auth`, `cli/cabildos`, `cli/familias`, `cli/miembros`, `cli/reportes` — 47 tests)
- **Orquestador**: `run-all.mjs` — ejecuta todas las suites y produce veredicto PASS / WARN / BLOCKED con reporte `qa-report.json` + JUnit XML (`qa-report.xml`)
- **Aislamiento**: cada suite levanta su propio backend en un puerto dinámico y usa una base `qa.db` propia — nunca toca `mirabel.db`
- **Detalle CLI**: `fileParallelism: false` en el vitest config de `apps/cli` (las suites comparten `~/.tatachio/config.json`; en paralelo, `clearConfig()` de un archivo haría race con la lectura `resolveToken()` de otro). Desde PR #58 las suites CLI asertan estrictamente — sin paths tolerantes "KNOWN BUG".

## Normas de Desarrollo

- **Conventional Commits:** `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- **HTTP Client:** `fetch` nativo de Node.js — nada de `axios`
- **Validaciones:** Zod en todas las entradas
- **Tipado:** estricto, evitar `any`
- **Base de datos:** SQLite, manejada con Prisma migrations
- **Dependencias:** solo con `pnpm`
