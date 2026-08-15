import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useChatStream } from "./useChatStream";

// Mock env module
vi.mock("../lib/env", () => ({
  getApiBaseUrl: () => "http://localhost:3000",
}));

/**
 * Creates a mock ReadableStream that enqueues chunks in 2-3 splits
 * simulating progressive streaming.
 */
function createMockStream(chunks: string[], delayMs = 10): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    async pull(controller) {
      if (index < chunks.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

function createMockResponse(stream: ReadableStream<Uint8Array>, init?: { status?: number; headers?: Record<string, string> }): Response {
  return new Response(stream, {
    status: init?.status ?? 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...init?.headers },
  });
}

describe("useChatStream", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // AI-CHAT-1: streaming with raw UTF-8
  it("streams text progressively from ReadableStream", async () => {
    const stream = createMockStream(["Hello, ", "world", "!"]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createMockResponse(stream));

    const { result } = renderHook(() =>
      useChatStream({ token: "test-token" }),
    );

    // Send a message
    await act(async () => {
      result.current.send("Hi");
      // Advance timers to allow all chunks to be processed
      await vi.advanceTimersByTimeAsync(200);
    });

    // Verify user message was added
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toEqual({ role: "user", content: "Hi" });

    // Verify assistant message accumulated
    expect(result.current.messages[1].role).toBe("assistant");
    expect(result.current.messages[1].content).toBe("Hello, world!");

    // Verify final state
    expect(result.current.status).toBe("done");
  });

  // AI-CHAT-3: mid-stream error sentinel
  it("handles mid-stream error sentinel", async () => {
    const errorPayload = JSON.stringify({ error: "AI provider stream failed" });
    const chunks = [
      "Partial response...",
      `\nevent: error\ndata: ${errorPayload}\n\n`,
    ];
    const stream = createMockStream(chunks);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createMockResponse(stream));

    const { result } = renderHook(() =>
      useChatStream({ token: "test-token" }),
    );

    await act(async () => {
      result.current.send("test");
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("AI provider stream failed");
  });

  // AI-CHAT-3: 429 with retryAfter
  it("retries once on 429 with retryAfter", async () => {
    let callCount = 0;
    const retryStream = createMockStream(["Retried response"]);
    const successResponse = createMockResponse(retryStream);

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({ error: "Rate limited", retryAfter: 1 }),
          {
            status: 429,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return successResponse;
    });

    const { result } = renderHook(() =>
      useChatStream({ token: "test-token" }),
    );

    await act(async () => {
      result.current.send("test");
      // Advance through retry delay
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(callCount).toBe(2);
    expect(result.current.status).toBe("done");
  });

  // AI-CHAT-3: ModelNotFound
  it("surfaces ModelNotFound with availableModels", async () => {
    const errorBody = {
      error: "Model 'unknown-model' not found",
      availableModels: ["gpt-4", "claude-3"],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(errorBody), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { result } = renderHook(() =>
      useChatStream({ token: "test-token" }),
    );

    await act(async () => {
      result.current.send("test");
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("not found");
    expect(result.current.availableModels).toEqual(["gpt-4", "claude-3"]);
  });

  // Reset functionality
  it("reset clears messages and status", async () => {
    const stream = createMockStream(["response"]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createMockResponse(stream));

    const { result } = renderHook(() =>
      useChatStream({ token: "test-token" }),
    );

    await act(async () => {
      result.current.send("test");
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.messages.length).toBeGreaterThan(0);

    act(() => {
      result.current.reset();
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });
});
