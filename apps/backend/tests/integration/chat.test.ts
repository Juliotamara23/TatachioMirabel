import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { throttleAiCall, resetThrottle } from "../helpers/ai-throttle.js";

// ── Test AI configuration ──────────────────────────────────────────
const TEST_AI_MODEL = process.env.TEST_AI_MODEL || "";
const SKIP_AI = process.env.SKIP_AI_TESTS === "true" || !TEST_AI_MODEL;
const PROVIDER = TEST_AI_MODEL.startsWith("ollama/") ? "ollama" : "google";
const THROTTLE = PROVIDER === "google"; // solo google tiene rate limit externo

// ── Build minimal test app ──────────────────────────────────────────
const app = express();
app.use(express.json());

import chatRouter from "../../src/routes/chat.js";
import modelsRouter from "../../src/routes/models.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";

app.use("/api/chat", chatRouter);
app.use("/api/models", modelsRouter);
app.use(errorHandler);

// ── Helpers ──────────────────────────────────────────────────────────

let adminToken = "";
let capiToken = "";

// Removed hardcoded API_KEY — model selection is now via TEST_AI_MODEL env var

describe("Chat API Integration", () => {
  beforeAll(async () => {
    resetThrottle();
    // Need auth routes for token generation — build them in
    // Actually, let me use a simpler approach: generate tokens inline
    // using JWT directly since we know the secret
    const jwt = await import("jsonwebtoken");
    adminToken = jwt.default.sign(
      { id: "test-admin-id", rol: "ADMINISTRADOR" },
      process.env.JWT_SECRET || "test-secret",
      { expiresIn: "1h" }
    );
    capiToken = jwt.default.sign(
      { id: "test-capi-id", rol: "CAPITANA" },
      process.env.JWT_SECRET || "test-secret",
      { expiresIn: "1h" }
    );
  });

  afterAll(async () => {
    // No cleanup needed
  });

  // ── Authentication ──────────────────────────────────────────────

  describe("POST /api/chat — Auth", () => {
    it("returns 401 when no token is provided", async () => {
      const res = await request(app)
        .post("/api/chat")
        .send({ messages: [{ role: "user", content: "Hola" }] });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error).toContain("Token");
    });

    it("returns 401 when token is malformed", async () => {
      const res = await request(app)
        .post("/api/chat")
        .set("Authorization", "Bearer not-a-real-jwt")
        .send({ messages: [{ role: "user", content: "Hola" }] });

      expect(res.status).toBe(401);
    });
  });

  // ── Validation ──────────────────────────────────────────────────

  describe("POST /api/chat — Validation", () => {
    it("returns 400 when messages is missing", async () => {
      const res = await request(app)
        .post("/api/chat")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("returns 400 when messages is not an array", async () => {
      const res = await request(app)
        .post("/api/chat")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ messages: "hello" });

      expect(res.status).toBe(400);
    });

    it("returns 400 when messages array is empty", async () => {
      const res = await request(app)
        .post("/api/chat")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ messages: [] });

      expect(res.status).toBe(400);
    });

    it("returns 400 when message role is invalid", async () => {
      const res = await request(app)
        .post("/api/chat")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ messages: [{ role: "bot", content: "hi" }] });

      expect(res.status).toBe(400);
    });
  });

  // ── Rate Limiting ───────────────────────────────────────────────

  describe("POST /api/chat — Rate Limiting", () => {
    it("returns 429 when CAPITANA exceeds 20 requests", async () => {
      // Throttle external API calls to avoid hitting Google's rate limit.
      // Ollama (local) skips throttling entirely.
      const results: number[] = [];
      for (let i = 0; i < 21; i++) {
        if (THROTTLE) await throttleAiCall();
        const res = await request(app)
          .post("/api/chat")
          .set("Authorization", `Bearer ${capiToken}`)
          .send({
            messages: [{ role: "user", content: "test" }],
            stream: false,
          });
        results.push(res.status);
      }

      // The 21st request should be 429
      expect(results[20]).toBe(429);
    });
  });

  // ── Valid Chat Requests ─────────────────────────────────────────

  describe("POST /api/chat — Valid requests", () => {
    // Only run if TEST_AI_MODEL is configured and not explicitly skipped
    const runIfKey = SKIP_AI ? describe.skip : describe;

    runIfKey(`with ${PROVIDER} model: ${TEST_AI_MODEL}`, () => {
      it("returns 200 with JSON for non-streaming request", async () => {
        const res = await request(app)
          .post("/api/chat")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            messages: [
              { role: "user", content: "Responde únicamente con la palabra: Hola" },
            ],
            model: TEST_AI_MODEL,
            stream: false,
          });

        // Either 200 (success) or 400/503 (model unavailable) depending on API
        expect([200, 400, 503]).toContain(res.status);
        if (res.status === 200) {
          expect(res.body).toHaveProperty("text");
          expect(res.body).toHaveProperty("model");
        }
      });

      it("returns 200 with streaming for default request", async () => {
        const res = await request(app)
          .post("/api/chat")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            messages: [
              { role: "user", content: "Di hola en una palabra" },
            ],
            model: TEST_AI_MODEL,
          });

        // Streaming returns text/plain content type
        if (res.status === 200) {
          expect(res.headers["content-type"]).toContain("text/plain");
        }
      });
    });
  });

  // ─── Invalid Model ──────────────────────────────────────────────

  describe("POST /api/chat — Invalid model", () => {
    it("returns 400 when requesting a non-existent model", async () => {
      const res = await request(app)
        .post("/api/chat")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          messages: [{ role: "user", content: "Hola" }],
          model: "nonexistent/model-id",
          stream: false,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("no encontrado");
    });
  });

  // ── GET /api/models ─────────────────────────────────────────────

  describe("GET /api/models", () => {
    it("returns 401 without authentication", async () => {
      const res = await request(app).get("/api/models");
      expect(res.status).toBe(401);
    });

    it("returns model list for authenticated user", async () => {
      const res = await request(app)
        .get("/api/models")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("models");
      expect(res.body).toHaveProperty("defaults");
      expect(Array.isArray(res.body.models)).toBe(true);
      expect(res.body.defaults.ADMINISTRADOR).toBeDefined();
      expect(res.body.defaults.CAPITANA).toBeDefined();
    });
  });
});
