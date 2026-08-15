import { useState, useEffect, useRef, useCallback } from "react";
import { getApiBaseUrl } from "../lib/env";

// Chat message role
export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

// State machine for streaming
export type ChatStatus = "idle" | "streaming" | "done" | "error" | "retrying";

interface UseChatStreamOptions {
  /** Auth token for the Authorization header */
  token: string | null;
  /** Model to use (optional — backend picks default when absent) */
  model?: string;
}

interface UseChatStreamReturn {
  messages: ChatMessage[];
  status: ChatStatus;
  error: string | null;
  /** Models returned by a ModelNotFound error (for repopulating the selector) */
  availableModels: string[] | null;
  send: (content: string) => Promise<void>;
  reset: () => void;
}

const MAX_AUTO_RETRIES = 1;

export function useChatStream({ token, model }: UseChatStreamOptions): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setStatus("idle");
    setError(null);
    setAvailableModels(null);
    retryCountRef.current = 0;
  }, []);

  const send = useCallback(async (content: string) => {
    if (!token) return;

    // Append user message
    const userMsg: ChatMessage = { role: "user", content };
    setMessages((prev) => [...prev, userMsg]);
    setStatus("streaming");
    setError(null);
    setAvailableModels(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const base = getApiBaseUrl();
      const response = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content }],
          model,
          stream: true,
        }),
        signal: controller.signal,
      });

      // Handle 429 with retryAfter
      if (response.status === 429) {
        const body = await response.json().catch(() => ({ error: "Rate limited" }));
        const retryAfter = (body as { retryAfter?: number }).retryAfter ?? 5;

        if (retryCountRef.current < MAX_AUTO_RETRIES) {
          retryCountRef.current += 1;
          setStatus("retrying");
          setError(`Reintentando en ${retryAfter}s...`);
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
          // Retry once with same content
          setStatus("idle");
          setMessages((prev) => prev.slice(0, -1)); // Remove user message, will re-add in recursive send
          await send(content);
          return;
        }

        setStatus("error");
        setError("Límite de solicitudes excedido. Intenta más tarde.");
        return;
      }

      // Handle ModelNotFound (400 with availableModels)
      if (response.status === 400) {
        const body = await response.json().catch(() => ({ error: "Bad request" }));
        const models = (body as { availableModels?: string[] }).availableModels;
        if (models) {
          setAvailableModels(models);
          setStatus("error");
          setError((body as { error: string }).error ?? "Modelo no encontrado");
          return;
        }
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error((body as { error: string }).error ?? `HTTP ${response.status}`);
      }

      // Read the streaming body as raw UTF-8
      const reader = response.body!.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulated = "";

      // Placeholder assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;

        // Check for mid-stream error sentinel from the backend:
        // "event: error\ndata: {...}\n\n"
        const errorSentinel = /event: error\ndata: (\{.*?\})\n\n/.exec(accumulated);
        if (errorSentinel) {
          try {
            const errData = JSON.parse(errorSentinel[1]) as { error: string };
            setStatus("error");
            setError(errData.error ?? "Error en el stream");
            // Update assistant message with whatever came before the sentinel
            setMessages((prev) => {
              const updated = [...prev];
              const lastIdx = updated.length - 1;
              const beforeSentinel = accumulated.split("event: error")[0];
              updated[lastIdx] = { ...updated[lastIdx], content: beforeSentinel.trim() };
              return updated;
            });
            reader.cancel();
            return;
          } catch {
            // Sentinel parse failed — keep accumulating
          }
        }

        // Progressive update of the assistant message
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: accumulated,
          };
          return updated;
        });
      }

      setStatus("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setStatus("idle");
        return;
      }
      setStatus("error");
      setError((err as Error).message ?? "Error de conexión");
    }
  }, [token, model]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { messages, status, error, availableModels, send, reset };
}
