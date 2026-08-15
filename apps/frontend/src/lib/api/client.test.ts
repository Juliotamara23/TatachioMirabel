import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { apiFetch, ApiError, setTokenProvider, setUnauthorizedHandler } from "./client";

describe("apiFetch (T3 — API client)", () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    setTokenProvider(() => "test-token-123");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setTokenProvider(null);
    setUnauthorizedHandler(null);
    vi.restoreAllMocks();
  });

  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("prepends base URL and sends Bearer token (CC-1)", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiFetch("/api/test");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/test"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token-123",
        }),
      }),
    );
  });

  it("returns parsed JSON on 2xx", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: "value" }));

    const result = await apiFetch<{ data: string }>("/api/test");

    expect(result).toEqual({ data: "value" });
  });

  it("throws ApiError with parsed envelope on non-2xx JSON (CC-2)", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "Not found", retryAfter: 5, details: { field: "id" } }, 404),
    );

    await expect(apiFetch("/api/missing")).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ApiError);
      const e = err as ApiError;
      expect(e.status).toBe(404);
      expect(e.body.error).toBe("Not found");
      expect(e.body.retryAfter).toBe(5);
      return true;
    });
  });

  it("throws ApiError with raw text on non-JSON error", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 }),
    );

    await expect(apiFetch("/api/broken")).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ApiError);
      const e = err as ApiError;
      expect(e.status).toBe(500);
      expect(e.body.error).toContain("Internal Server Error");
      return true;
    });
  });

  it("calls unauthorized handler on 401", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "Unauthorized" }, 401));

    await expect(apiFetch("/api/secret")).rejects.toBeInstanceOf(ApiError);

    expect(handler).toHaveBeenCalledOnce();
  });

  it("forwards RequestInit options", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiFetch("/api/data", { method: "POST", body: JSON.stringify({ x: 1 }) });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ x: 1 }),
      }),
    );
  });
});
