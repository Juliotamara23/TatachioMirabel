---
name: express-rest-api
description: Build production-ready RESTful APIs with Express.js, TypeScript ESM, and Zod validation. Use when creating routes, middleware, error handling, or API endpoints.
---

# Express REST API (TypeScript + ESM)

This project uses Express 4.22.1, TypeScript 5.9.3, ESM (`"type": "module"` in package.json), and Zod v4 for validation. All code is backend-only.

## Project Structure

```
src/
├── routes/          # Route definitions
├── controllers/     # Route handlers
├── middlewares/     # Validation, auth, error handling
├── services/        # Business logic (Prisma queries)
├── utils/           # Helpers
└── app.ts           # Express setup
```

## Core Patterns

### Application Setup

```typescript
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { memberRoutes } from "./routes/member.routes.js";
import { errorHandler } from "./middlewares/error-handler.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use("/api/members", memberRoutes);

app.use(errorHandler);

export { app };
```

### Route Definitions (ESM)

```typescript
import { Router } from "express";
import { getMembers, createMember } from "../controllers/member.controller.js";
import { validate } from "../middlewares/validate.js";
import { createMemberSchema } from "../schemas/member.schema.js";

export const memberRoutes = Router();

memberRoutes.get("/", getMembers);
memberRoutes.get("/:id", getMemberById);
memberRoutes.post("/", validate(createMemberSchema), createMember);
memberRoutes.put("/:id", validate(updateMemberSchema), updateMember);
memberRoutes.delete("/:id", deleteMember);
```

### Controllers

```typescript
import { Request, Response, NextFunction } from "express";

export const getMembers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const members = await prisma.member.findMany();
    res.json({ data: members });
  } catch (error) {
    next(error);
  }
};

export const createMember = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const member = await prisma.member.create({ data: req.body });
    res.status(201).json({ data: member });
  } catch (error) {
    next(error);
  }
};
```

## Zod Validation Middleware

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

### Schema Example

```typescript
import { z } from "zod";

export const createMemberSchema = z.object({
  name: z.string().min(1, { error: "Name is required" }),
  email: z.email({ error: "Invalid email" }),
  phone: z.string().optional(),
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;
```

## Error Handling

```typescript
import { Request, Response, NextFunction } from "express";

class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
  }
}

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  res.status(statusCode).json({
    error: err.message || "Internal server error",
  });
};
```

## HTTP Client Policy

Use native `fetch()` (Node.js 18+). Never use `axios`.

```typescript
const response = await fetch("https://api.example.com/data", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
const data = await response.json();
```

## HTTP Status Codes

- `200 OK` — Successful GET/PUT
- `201 Created` — Successful POST
- `204 No Content` — Successful DELETE
- `400 Bad Request` — Validation error
- `401 Unauthorized` — Missing or invalid auth
- `404 Not Found` — Resource not found
- `500 Internal Server Error` — Unexpected error

## Response Format

```typescript
// Success
{ data: { ... } }

// Error
{ error: "Message" }

// List with pagination
{ data: [...], meta: { page: 1, limit: 10, total: 100 } }
```

Ask the orchestrator before running any commands.
