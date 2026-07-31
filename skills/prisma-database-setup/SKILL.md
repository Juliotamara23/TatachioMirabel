---
name: prisma-database-setup
description: Prisma v6 database configuration for SQLite with UUID v4. Use when defining models, running migrations, or troubleshooting Prisma in this project. Triggers on "prisma", "schema", "migration", "model".
---

# Prisma Database Setup (SQLite only)

This project uses **Prisma v6.19.2** with **SQLite** as the only database provider.

## Schema Format

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

- No `output` directive in the generator block — that is Prisma v7 only.
- No `prisma.config.ts` — Prisma v6 reads the URL directly from the schema via `env("DATABASE_URL")`.
- No driver adapters needed for SQLite with Prisma v6.
- `DATABASE_URL` in `.env`: `file:./dev.db`

## Client Instantiation

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
```

No adapter, no custom path — PrismaClient is generated into `@prisma/client` by default.

## IDs — UUID v4

All model IDs use UUID v4, generated at the application level:

```prisma
model Member {
  id        String   @id
  name      String
  email     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

```typescript
import { v4 as uuidv4 } from "uuid";

const member = await prisma.member.create({
  data: {
    id: uuidv4(),
    name: "Example",
    email: "example@test.com",
  },
});
```

## Migrations

Ask the orchestrator before running any commands. The typical workflow is:

- `prisma migrate dev --name <name>` — creates and applies a new migration
- `prisma db push` is NOT recommended for SQLite (it can cause data loss on destructive changes)
- `prisma generate` — regenerates the client after schema changes
- `prisma studio` — opens the data browser GUI

## Query Patterns

```typescript
// Find with relations
const member = await prisma.member.findUnique({
  where: { id },
  include: { dependents: true },
});

// Paginated list
const members = await prisma.member.findMany({
  skip: (page - 1) * limit,
  take: limit,
  orderBy: { createdAt: "desc" },
});

// Transaction
const [result] = await prisma.$transaction([
  prisma.member.create({ data: memberData }),
  prisma.auditLog.create({ data: logData }),
]);
```
