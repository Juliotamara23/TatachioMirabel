---
name: typescript
description: TypeScript strict patterns: const types, flat interfaces, utility types, type guards, z.infer, satisfies. Triggers on writing TypeScript types, interfaces, generics, or refactoring .ts files.
---

# TypeScript Patterns

This project uses TypeScript 5.9.3 with ESM (`"type": "module"` in package.json). All code is backend-only.

## Const Types Pattern (REQUIRED)

```typescript
// ✅ ALWAYS: Create const object first, then extract type
const STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  PENDING: "PENDING",
} as const;

type Status = (typeof STATUS)[keyof typeof STATUS];

// ❌ NEVER: Direct union types without a runtime map
type Status = "ACTIVE" | "INACTIVE" | "PENDING";
```

Single source of truth, runtime values, autocomplete, easier refactoring.

## Zod Type Inference — `z.infer`

```typescript
import { z } from "zod";

const createMemberSchema = z.object({
  nombres: z.string().min(1),
  apellidos: z.string().min(1),
  numeroDocumento: z.string().min(1).max(20),
  tipoIdentificacion: z.enum(["CC", "TI", "RC", "NUIP"]),
  sexo: z.enum(["M", "F"]),
});

// Derive TypeScript type from Zod schema
type CreateMemberInput = z.infer<typeof createMemberSchema>;

// Controller receives the typed body after validation middleware
const data: CreateMemberInput = req.body;
```

## `satisfies` Operator

```typescript
import { Prisma } from "@prisma/client";

// Ensures the object satisfies PrismaCreateInput without widening the type
const memberData = {
  nombres: "ANA",
  apellidos: "PÉREZ",
  numeroDocumento: "12345",
  tipoIdentificacion: "CC",
  sexo: "F",
  parentesco: "CF",
  familiaId: "uuid-here",
  cabildoId: "uuid-here",
} satisfies Prisma.MiembroCreateInput;
```

## Flat Interfaces (REQUIRED)

```typescript
// ✅ ALWAYS: One level depth, nested objects → dedicated interface
interface Direccion {
  calle: string;
  ciudad: string;
}

interface Miembro {
  id: string;
  nombres: string;
  apellidos: string;
  direccion: Direccion;  // Reference, not inline
}

interface Administrador extends Miembro {
  permisos: string[];
}

// ❌ NEVER: Inline nested objects
interface Miembro {
  direccion: { calle: string; ciudad: string };  // NO!
}
```

## Never Use `any`

```typescript
// ✅ Use unknown for truly unknown types
function parse(input: unknown): Miembro {
  if (isMiembro(input)) return input;
  throw new Error("Invalid input");
}

// ✅ Use generics for flexible types
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

// ❌ NEVER
function parse(input: any): any { }
```

## Utility Types

```typescript
Pick<Miembro, "id" | "nombres">     // Select fields
Omit<Miembro, "id">                 // Exclude fields
Partial<Miembro>                    // All optional
Required<Miembro>                   // All required
Readonly<Miembro>                   // All readonly
Record<string, Miembro>             // Object type
Extract<Union, "a" | "b">           // Extract from union
Exclude<Union, "a">                 // Exclude from union
NonNullable<T | null>               // Remove null/undefined
ReturnType<typeof fn>               // Function return type
Parameters<typeof fn>               // Function params tuple
Awaited<Promise<T>>                 // Unwrap promise
```

## Type Guards

```typescript
function isMiembro(value: unknown): value is Miembro {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "nombres" in value &&
    "apellidos" in value
  );
}
```

## ESM Import Patterns

```typescript
// Type-only imports
import type { Miembro } from "./types.js";

// Mixed imports
import { createMiembro, type Config } from "./utils.js";

// Dynamic imports
const { PrismaClient } = await import("@prisma/client");

// Native fetch (no axios)
const response = await fetch("https://api.example.com/data");
const data = await response.json() as MiembroResponse;
```

Ask the orchestrator before running any commands.
