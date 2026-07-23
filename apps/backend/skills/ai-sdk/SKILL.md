---
name: ai-sdk
description: Vercel AI SDK v6 backend-only patterns — generateText, streamText, generateObject, tool(). Use when building AI features, tool calling, structured output, or LLM integration in the backend. Triggers on "AI SDK", "generateText", "streamText", "tool call", "LLM", "Ollama".
---

# AI SDK — Backend Only

This project uses the **Vercel AI SDK v6.0.142** (provider-agnostic). This is a **backend-only** repo — no React, no `useChat`, no `useCompletion`.

## Provider Pattern

The AI SDK is provider-agnostic. For local development, this project uses Ollama via `ollama-ai-provider`:

```typescript
import { generateText } from "ai";
import { ollama } from "ollama-ai-provider";

const model = ollama("llama3.1:8b");

const { text } = await generateText({
  model,
  prompt: "Resume los miembros activos del cabildo",
});
```

For Google Gemini (production):

```typescript
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

const model = google("gemini-2.0-flash");

const { text } = await generateText({
  model,
  system: "Eres un asistente para gestión de censos de cabildos indígenas.",
  prompt: "Analiza este censo...",
});
```

The [Vercel AI Gateway](references/ai-gateway.md) may be used as an optional provider.

## Core Functions (Backend Only)

### `generateText`

```typescript
import { generateText } from "ai";

const { text, usage } = await generateText({
  model,
  system: "You are a census data analyzer.",
  prompt: `Analyze the following member data: ${JSON.stringify(members)}`,
  temperature: 0.3,
});
```

### `streamText`

```typescript
import { streamText } from "ai";

export async function streamAnalysis(req: Request, res: Response) {
  const result = await streamText({
    model,
    prompt: req.body.data,
  });

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  for await (const chunk of result.textStream) {
    res.write(chunk);
  }
  res.end();
}
```

### `generateObject` — Structured Output

```typescript
import { generateObject } from "ai";
import { z } from "zod";

const memberCategorySchema = z.object({
  genderBreakdown: z.object({
    male: z.number(),
    female: z.number(),
  }),
  ageGroups: z.record(z.string(), z.number()),
  summary: z.string(),
});

const { object } = await generateObject({
  model,
  schema: memberCategorySchema,
  prompt: `Analiza demográficamente: ${JSON.stringify(members)}`,
});

// object is typed as z.infer<typeof memberCategorySchema>
```

### `tool()` — Tool Calling with Prisma

```typescript
import { generateText, tool } from "ai";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const getCabildoMembers = tool({
  description: "Get all members of a cabildo by cabildo name",
  parameters: z.object({
    cabildoName: z.string().min(1),
  }),
  execute: async ({ cabildoName }) => {
    const cabildo = await prisma.cabildo.findFirst({
      where: { nombre: cabildoName },
      include: { miembros: true },
    });
    return cabildo ?? { error: "Cabildo not found" };
  },
});

const { text, steps } = await generateText({
  model,
  tools: { getCabildoMembers },
  maxSteps: 5,
  prompt: "¿Cuántos miembros activos hay en el cabildo Tatachio?",
});
```

## Type Safety with Tools

Always define tool parameters with Zod schemas:

```typescript
import { tool } from "ai";
import { z } from "zod";

const searchMembers = tool({
  description: "Search members by name or document number",
  parameters: z.object({
    query: z.string().min(1).describe("Name or document number to search"),
    cabildoId: z.string().uuid().describe("Cabildo UUID"),
    limit: z.number().int().positive().max(100).default(10),
  }),
  execute: async ({ query, cabildoId, limit }) => {
    return prisma.miembro.findMany({
      where: {
        cabildoId,
        OR: [
          { nombres: { contains: query.toUpperCase() } },
          { apellidos: { contains: query.toUpperCase() } },
          { numeroDocumento: query },
        ],
      },
      take: limit,
    });
  },
});
```

## Error Handling

```typescript
import { generateText, NoSuchModelError, InvalidPromptError } from "ai";

try {
  const { text } = await generateText({ model, prompt });
} catch (error) {
  if (error instanceof NoSuchModelError) {
    // Wrong model name
  } else if (error instanceof InvalidPromptError) {
    // Prompt rejected by provider
  }
}
```

Never trust AI SDK knowledge from memory — always verify against `node_modules/ai/docs/` and `node_modules/ai/src/` for current APIs. Ask the orchestrator before running any commands.
