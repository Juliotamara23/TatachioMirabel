import { describe, it, expect, beforeEach, vi } from "vitest";
import { Request, Response } from "express";

// ── Mock the chat service ──────────────────────────────────────────
vi.mock("../../src/services/chatService.js", () => ({
  runChat: vi.fn(),
}));

// ── Mock the streaming helpers from ai ────────────────────────────
vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    pipeTextStreamToResponse: vi.fn(),
  };
});

// ── Mock modelRegistry errors ─────────────────────────────────────
vi.mock("../../src/services/modelRegistry.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/services/modelRegistry.js")
  >("../../src/services/modelRegistry.js");
  return {
    ...actual,
    ModelNotFoundError: actual.ModelNotFoundError,
    NoModelsAvailableError: actual.NoModelsAvailableError,
  };
});

import { chatHandler } from "../../src/controllers/chatController.js";
import { runChat } from "../../src/services/chatService.js";
import { pipeTextStreamToResponse } from "ai";
import {
  ModelNotFoundError,
  NoModelsAvailableError,
} from "../../src/services/modelRegistry.js";

// ── Helpers ────────────────────────────────────────────────────────

function mockReq(body: unknown, usuario?: { id: string; rol: string }): Request {
  return {
    body,
    usuario: usuario || { id: "test-user", rol: "ADMINISTRADOR" },
  } as unknown as Request;
}

function mockRes(): Response {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

// ── Tests ──────────────────────────────────────────────────────────

describe("chatController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("request validation", () => {
    it("returns 400 when body is not an object", async () => {
      const req = mockReq("not-json");
      const res = mockRes();

      await chatHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining("inválido") })
      );
    });

    it("returns 400 when messages is missing", async () => {
      const req = mockReq({});
      const res = mockRes();

      await chatHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 400 when messages is not an array", async () => {
      const req = mockReq({ messages: "hello" });
      const res = mockRes();

      await chatHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 400 when messages array is empty", async () => {
      const req = mockReq({ messages: [] });
      const res = mockRes();

      await chatHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 400 when a message has invalid role", async () => {
      const req = mockReq({
        messages: [{ role: "invalid", content: "hola" }],
      });
      const res = mockRes();

      await chatHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("successful chat", () => {
    it("calls runChat with messages and user role", async () => {
      vi.mocked(runChat).mockResolvedValue({
        result: { textStream: {} } as never,
        modelInfo: { id: "google/gemini-2.0-flash", name: "Gemini 2.0 Flash" } as never,
      });

      const req = mockReq(
        {
          messages: [{ role: "user", content: "¿Cuántos miembros hay?" }],
        },
        { id: "user-1", rol: "ADMINISTRADOR" }
      );
      const res = mockRes();

      await chatHandler(req, res);

      expect(runChat).toHaveBeenCalledWith(
        [{ role: "user", content: "¿Cuántos miembros hay?" }],
        "ADMINISTRADOR",
        { model: undefined, stream: true }
      );
    });

    it("pipes stream to response when stream defaults to true", async () => {
      vi.mocked(runChat).mockResolvedValue({
        result: { textStream: {} } as never,
        modelInfo: { id: "google/gemini-2.0-flash", name: "Gemini 2.0 Flash" } as never,
      });

      const req = mockReq({
        messages: [{ role: "user", content: "Hola" }],
      });
      const res = mockRes();

      await chatHandler(req, res);

      expect(pipeTextStreamToResponse).toHaveBeenCalled();
    });

    it("passes explicit model to runChat", async () => {
      vi.mocked(runChat).mockResolvedValue({
        result: { textStream: {} } as never,
        modelInfo: { id: "test/model", name: "Test" } as never,
      });

      const req = mockReq({
        messages: [{ role: "user", content: "Hola" }],
        model: "ollama/qwen3.5:9b",
        stream: false,
      });

      await chatHandler(req, mockRes());

      expect(runChat).toHaveBeenCalledWith(
        expect.anything(),
        "ADMINISTRADOR",
        { model: "ollama/qwen3.5:9b", stream: false }
      );
    });

    it("returns JSON when stream is false", async () => {
      vi.mocked(runChat).mockResolvedValue({
        result: {
          text: "Hola, ¿en qué puedo ayudarte?",
          steps: [],
        } as never,
        modelInfo: { id: "google/gemini-2.0-flash", name: "Gemini 2.0 Flash" } as never,
      });

      const req = mockReq({
        messages: [{ role: "user", content: "Hola" }],
        stream: false,
      });
      const res = mockRes();

      await chatHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Hola, ¿en qué puedo ayudarte?",
          model: "Gemini 2.0 Flash",
        })
      );
    });
  });

  describe("error handling", () => {
    it("returns 400 for ModelNotFoundError", async () => {
      vi.mocked(runChat).mockRejectedValue(
        new ModelNotFoundError("bad-model", [])
      );

      const req = mockReq({
        messages: [{ role: "user", content: "Hola" }],
        model: "bad-model",
      });
      const res = mockRes();

      await chatHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("no encontrado"),
        })
      );
    });

    it("returns 503 for NoModelsAvailableError", async () => {
      vi.mocked(runChat).mockRejectedValue(new NoModelsAvailableError());

      const req = mockReq({
        messages: [{ role: "user", content: "Hola" }],
      });
      const res = mockRes();

      await chatHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("No hay modelos"),
        })
      );
    });

    it("throws unknown errors (let errorHandler catch them)", async () => {
      vi.mocked(runChat).mockRejectedValue(new Error("DB connection failed"));

      const req = mockReq({
        messages: [{ role: "user", content: "Hola" }],
      });
      const res = mockRes();

      // Should not catch this — it throws so errorHandler can handle it
      await expect(chatHandler(req, res)).rejects.toThrow("DB connection failed");
    });
  });
});
