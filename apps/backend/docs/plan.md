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
| **CLI** | Admin | Fase 1 | Terminal: login + chat con el LLM + comandos rápidos. Interfaz principal del admin. |
| **Web** | Admin | Fase 2 | Paneles, dashboards, CRUD visual. Opcional. |
| **PWA Mobile** | Capitana | Fase 3 | Interfaz tipo chat, mobile-first, offline-first (caché IndexedDB). |

El LLM es la interfaz principal para operar los datos. El REST tradicional queda solo para:

- `POST /api/auth/login` — autenticación (JWT)
- `POST /api/chat` — el core del negocio
- `GET /api/reportes/:id.xlsx` — descarga de Excel

## Decisiones Arquitectónicas

- **SQLite es definitivo.** No hay migración a PostgreSQL. El proyecto se usa ~3 meses al año, no justifica costo ni complejidad. SQLite permite: backup = copiar archivo, deploy = cualquier VPS de $5 o incluso localhost durante la temporada activa.
- **Tool calling sobre la DB.** No RAG para datos operativos. Las consultas van directo a SQLite vía Prisma. Es más barato (sin embeddings), más preciso (datos concretos no se alucinan) y permite writes controlados.
- **Sin costos de infraestructura.** Sin VPS fijo, sin servicios cloud pagados. El backend corre bajo demanda durante la temporada de trabajo censal.
- **Dos roles:**
  - **Admin**: acceso total (CRUD completo), CLI + web.
  - **Capitana**: lectura + creación + edición de miembros. No puede eliminar registros. Acceso vía PWA mobile con agente IA con guardrails.
- **CLI como cliente completo.** El CLI no es solo un wrapper del chat — es un cliente de la API REST que expone todos los comandos disponibles (tipo `gh` o `gcloud`). Autenticación vía JWT (login o variable de entorno). Usable desde OpenCode o cualquier terminal.
- **LLM provider-agnóstico.** El stack de IA (Vercel AI SDK) permite usar cualquier proveedor sin cambiar el código: OpenAI, Google Gemini, Anthropic, Ollama, etc.
- **PWA offline-first para Capitana.** La capitana accede vía PWA con caché local (IndexedDB). En modo conectado sincroniza con el backend. En modo offline consulta los datos cacheados. Sin dependencia de internet permanente.

## Estado Real del Proyecto

### ✅ Fase 0.1 — Fundamentos (Completo)
- [x] Configuración del monorepo (pnpm workspace)
- [x] Prisma + SQLite con todos los modelos
- [x] Express + TypeScript corriendo
- [x] Base de datos funcional con datos de prueba

### ✅ Fase 0.2 — Auth + CRUD (Funcional, con huecos)
- [x] Auth JWT (register/login) probado y funcionando
- [x] CRUD de Miembros completo con Zod
- [x] Middleware de autenticación y roles
- [ ] ❌ Faltan CRUDs de Cabildo y Familia (modelos existen, sin API)
- [ ] ❌ Rol Capitana definido en schema pero sin implementar en middleware
- [ ] ❌ Error handler global (hoy si algo crashea, no responde JSON)

### ✅ Fase 0.3 — Motor IA (Código escrito, sin probar)
- [x] Vercel AI SDK con Gemini + Ollama
- [x] Sistema de fallback automático
- [x] Esquema Zod para salida estructurada
- [ ] ❌ No probado con API keys reales

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
- [x] Model registry provider-agnóstico (Google Gemini, Ollama)

### Fase 1C — CLI Admin
Prioridad: **alta** — interfaz principal del admin.

- [ ] Cliente de terminal como paquete independiente (`packages/cli/` o binario)
- [ ] Autenticación: `login` (cachea token) o leer `TATACHIO_TOKEN` de env
- [ ] Comandos CRUD directos (sin LLM): `miembros list`, `miembros get`, `miembros create`, `miembros update`, `familias list`, `cabildos list`
- [ ] Comando `chat` — sesión interactiva con el LLM vía tool calling
- [ ] Modo pipe: entradas y salidas en JSON para scripts
- [ ] Documentado para uso desde OpenCode

### Fase 2 — Frontend Admin (Web)
Prioridad: **media** — interfaz web complementaria al CLI.

- [ ] Login
- [ ] Panel de chat IA
- [ ] Paneles de consulta (Miembros, Familias, Cabildos)
- [ ] CRUD visual para administración
- [ ] Descarga de reportes Excel

### Fase 3 — Frontend Capitana (Mobile)
Prioridad: **media** — PWA offline-first, tipo chat.

- [ ] PWA con Service Worker + caché IndexedDB
- [ ] Modo conectado: sincronización bidireccional con el backend
- [ ] Modo offline: consulta de datos cacheados (lectura sin conexión)
- [ ] Interfaz tipo chat (WhatsApp-like) para consultas en lenguaje natural
- [ ] Agente IA con guardrails: puede consultar, crear y editar miembros. Sin permisos de eliminación.
- [ ] Búsqueda de personas por nombre, apellido o familia
- [ ] Sin costo de infraestructura adicional (mismo backend, expuesto vía túnel temporal)

### Fase 4 — Reportes Excel (Ministerio del Interior)
Prioridad: **baja** — se necesita al final del ciclo censal.

- [ ] Generación de .xlsx en formato oficial Ministerio del Interior
- [ ] Censo general, Altas, Bajas
- [ ] API de descarga

## Normas de Desarrollo

- **Conventional Commits:** `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- **HTTP Client:** `fetch` nativo de Node.js — nada de `axios`
- **Validaciones:** Zod en todas las entradas
- **Tipado:** estricto, evitar `any`
- **Base de datos:** SQLite, manejada con Prisma migrations
- **Dependencias:** solo con `pnpm`
