import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Request, Response, NextFunction } from "express";

// We need to import the rateLimiter - it doesn't exist yet (RED)
import { rateLimiter } from "../../src/middleware/rateLimiter.js";

// ── Helpers ──────────────────────────────────────────────────────────

interface UsuarioPayload {
  id: string;
  rol: string;
}

function mockReq(user: UsuarioPayload): Request {
  return {
    usuario: user,
  } as unknown as Request;
}

function mockRes(): Response {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

function mockNext(): NextFunction {
  return vi.fn();
}

// ── Tests ────────────────────────────────────────────────────────────

describe("rateLimiter", () => {
  // Fake timers for time-based token refill tests
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("basic flow", () => {
    it("calls next() when user is within rate limit (ADMIN)", () => {
      const req = mockReq({ id: "user-a", rol: "ADMINISTRADOR" });
      const res = mockRes();
      const next = mockNext();

      rateLimiter(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it("calls next() when user is within rate limit (CAPITANA)", () => {
      const req = mockReq({ id: "user-b", rol: "CAPITANA" });
      const res = mockRes();
      const next = mockNext();

      rateLimiter(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe("rate limit exceeded", () => {
    it("returns 429 when ADMIN exceeds 60 requests in window", () => {
      const req = mockReq({ id: "admin-heavy", rol: "ADMINISTRADOR" });
      const res = mockRes();
      const next = mockNext();

      // Consume all tokens (60)
      for (let i = 0; i < 60; i++) {
        const resLoop = mockRes();
        rateLimiter(req, resLoop, mockNext());
      }

      // This one should be blocked
      rateLimiter(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("Demasiadas"),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 429 when CAPITANA exceeds 20 requests in window", () => {
      const req = mockReq({ id: "capi-heavy", rol: "CAPITANA" });
      const res = mockRes();
      const next = mockNext();

      // Consume all tokens (20)
      for (let i = 0; i < 20; i++) {
        const resLoop = mockRes();
        rateLimiter(req, resLoop, mockNext());
      }

      rateLimiter(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("Demasiadas"),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("sets Retry-After header when rate limited", () => {
      const req = mockReq({ id: "capi-limited", rol: "CAPITANA" });
      const res = mockRes();

      for (let i = 0; i < 20; i++) {
        rateLimiter(req, mockRes(), mockNext());
      }

      rateLimiter(req, res, mockNext());

      // Either set or setHeader was called with Retry-After
      const setCalled = (res.set as ReturnType<typeof vi.fn>).mock.calls.some(
        (call: unknown[]) => call[0] === "Retry-After"
      );
      const setHeaderCalled = (
        res.setHeader as ReturnType<typeof vi.fn>
      ).mock.calls.some((call: unknown[]) => call[0] === "Retry-After");
      expect(setCalled || setHeaderCalled).toBe(true);
    });
  });

  describe("per-user isolation", () => {
    it("rate limiting user A does not affect user B", () => {
      const reqA = mockReq({ id: "user-a", rol: "CAPITANA" });
      const nextA = mockNext();

      // Exhaust user A's limit
      for (let i = 0; i < 20; i++) {
        rateLimiter(reqA, mockRes(), mockNext());
      }

      // User B should still work
      const reqB = mockReq({ id: "user-b", rol: "CAPITANA" });
      const resB = mockRes();
      const nextB = mockNext();
      rateLimiter(reqB, resB, nextB);

      expect(nextB).toHaveBeenCalledOnce();
    });
  });

  describe("token refill over time", () => {
    it("allows requests again after tokens refill", () => {
      const req = mockReq({ id: "refill-user", rol: "CAPITANA" });
      const next = mockNext();

      // Exhaust limit
      for (let i = 0; i < 20; i++) {
        rateLimiter(req, mockRes(), mockNext());
      }

      // Advance time: CAPITANA refill rate is 0.33/sec, so 1 token ≈ 3 sec
      // Advance 30 seconds → ~10 tokens refilled
      vi.advanceTimersByTime(30_000);

      const resRecovered = mockRes();
      const nextRecovered = mockNext();
      rateLimiter(req, resRecovered, nextRecovered);

      expect(nextRecovered).toHaveBeenCalledOnce();
    });
  });

  describe("unknown role falls back to CAPITANA", () => {
    it("uses CAPITANA limit for unknown roles", () => {
      const req = mockReq({ id: "unknown-role", rol: "INVITADO" });
      const next = mockNext();

      // Should at least allow a few requests (CAPITANA allows 20)
      for (let i = 0; i < 5; i++) {
        const resLoop = mockRes();
        const nextLoop = mockNext();
        rateLimiter(req, resLoop, nextLoop);
        expect(nextLoop).toHaveBeenCalled();
      }
    });
  });
});
