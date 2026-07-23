---
name: zod-4
description: Zod v4 schema validation: Express request validation, Prisma input types, safeParse, z.infer. Use when creating validation schemas for API payloads, Prisma inputs, or any data parsing. Triggers on "Zod", "validation", "schema", "safeParse".
---

# Zod v4 — Validation & Type Inference

This project uses **Zod v4.3.6**. Patterns are backend-only — no React Hook Form, no client-side validation.

## Breaking Changes from Zod v3

```typescript
// ❌ Zod 3 (OLD)
z.string().email()
z.string().uuid()
z.string().url()
z.string().nonempty()
z.object({ name: z.string() }).required_error("Required")

// ✅ Zod 4 (NEW)
z.email()
z.uuid()
z.url()
z.string().min(1)
z.object({ name: z.string() }, { error: "Required" })
```

Error messages use `{ error: "message" }` instead of the old `{ message: "message" }`.

## Express Request Validation Middleware

```typescript
import { z } from "zod";
import { Request, Response, NextFunction } from "express";

export const validate = (schema: z.ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues });
    }
    req.body = result.data;
    next();
  };
```

### Route Usage

```typescript
import { Router } from "express";
import { validate } from "../middlewares/validate.js";

const createMemberSchema = z.object({
  nombres: z.string().min(1, { error: "Nombres requeridos" }),
  apellidos: z.string().min(1, { error: "Apellidos requeridos" }),
  numeroDocumento: z.string().min(1).max(20),
  tipoIdentificacion: z.enum(["CC", "TI", "RC", "NUIP"]),
  fechaNacimiento: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
  sexo: z.enum(["M", "F"]),
  parentesco: z.enum(["PA", "MA", "CO", "HE", "CF", "ES", "HI", "YR", "NU", "SU", "SO", "CU", "TI", "AB", "NI"]),
  familiaId: z.string().uuid(),
  cabildoId: z.string().uuid(),
});

export const memberRoutes = Router();
memberRoutes.post("/", validate(createMemberSchema), createMember);
```

## Deriving Prisma Input Types from Zod Schemas

```typescript
import { z } from "zod";
import { Prisma } from "@prisma/client";

export const createMemberSchema = z.object({
  nombres: z.string().min(1),
  apellidos: z.string().min(1),
  numeroDocumento: z.string().min(1).max(20),
  tipoIdentificacion: z.enum(["CC", "TI", "RC", "NUIP"]),
  fechaNacimiento: z.string(),
  sexo: z.enum(["M", "F"]),
  parentesco: z.enum(["PA", "MA", "CO", "HE", "CF", "ES", "HI", "YR", "NU", "SU", "SO", "CU", "TI", "AB", "NI"]),
  familiaId: z.string().uuid(),
  cabildoId: z.string().uuid(),
});

export const updateMemberSchema = createMemberSchema.partial();

// Derive TypeScript type from schema
export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

// Controller receives the typed body after validation middleware
export const createMember = async (req: Request, res: Response) => {
  const data = req.body as CreateMemberInput;
  // data is fully typed
};
```

## Query Parameters Validation

```typescript
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().optional(),
  sexo: z.enum(["M", "F"]).optional(),
});

export const validateQuery = (schema: z.ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues });
    }
    req.query = result.data as any;
    next();
  };
```

## Error Handling in Controllers

```typescript
import { z } from "zod";

// Inside a controller — parse with detailed error response
const result = createMemberSchema.safeParse(req.body);
if (!result.success) {
  const formatted = result.error.issues.map((i) => ({
    field: i.path.join("."),
    message: i.message,
  }));
  return res.status(400).json({ error: "Validation failed", issues: formatted });
}

const data = result.data; // Fully typed
```

## Object Schemas

```typescript
const userSchema = z.object({
  id: z.uuid(),
  email: z.email({ error: "Correo inválido" }),
  nombre: z.string().min(1, { error: "Nombre requerido" }),
  rol: z.enum(["ADMINISTRADOR", "CAPITANA"]),
});

type User = z.infer<typeof userSchema>;
```

## Arrays, Records, Tuples

```typescript
const tagsSchema = z.array(z.string()).min(1).max(10);
const scoresSchema = z.record(z.string(), z.number());
const coordinatesSchema = z.tuple([z.number(), z.number()]);
```

## Unions and Discriminated Unions

```typescript
// Discriminated union (preferred — more efficient)
const resultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("success"), data: z.unknown() }),
  z.object({ status: z.literal("error"), error: z.string() }),
]);
```

## Transformations

```typescript
const lowercaseEmail = z.email().transform(email => email.toLowerCase());
const numberFromString = z.coerce.number();  // "42" → 42
const dateFromString = z.coerce.date();      // "2024-01-01" → Date

const trimmedString = z.preprocess(
  val => typeof val === "string" ? val.trim() : val,
  z.string()
);
```

## Refinements

```typescript
const passwordSchema = z.string()
  .min(8)
  .refine(val => /[A-Z]/.test(val), { message: "Must contain uppercase letter" })
  .refine(val => /[0-9]/.test(val), { message: "Must contain number" });

const formSchema = z.object({
  password: z.string(),
  confirmPassword: z.string(),
}).superRefine((data, ctx) => {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });
  }
});
```

Ask the orchestrator before running any commands.
