import { useState, useEffect, useCallback } from "react";
import { useChatStream, type ChatMessage } from "../../hooks/useChatStream";
import { useAuth } from "../../contexts/AuthContext";
import { getApiBaseUrl } from "../../lib/env";
import { ModelSelector } from "./ModelSelector";

/**
 * TypingIndicator — blinking caret shown during streaming.
 */
function TypingIndicator() {
  return (
    <span data-testid="typing-indicator" className="inline-flex items-center gap-0.5">
      <span className="h-2 w-2 animate-pulse rounded-full bg-orange-brand" />
      <span className="h-2 w-2 animate-pulse rounded-full bg-orange-brand [animation-delay:0.2s]" />
      <span className="h-2 w-2 animate-pulse rounded-full bg-orange-brand [animation-delay:0.4s]" />
    </span>
  );
}

/**
 * MessageList — renders chat messages with role-based styling.
 */
function MessageList({ messages, isStreaming }: { messages: ChatMessage[]; isStreaming: boolean }) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-400 dark:text-gray-500">
        <p>Envía un mensaje para comenzar la conversación.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" data-testid="message-list">
      {messages.map((msg, idx) => {
        const isLast = idx === messages.length - 1;
        const isUser = msg.role === "user";
        return (
          <div
            key={idx}
            className={`flex ${isUser ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[70%] rounded-lg px-4 py-2 text-sm ${
                isUser
                  ? "bg-orange-brand text-white"
                  : "bg-gray-100 text-gray-800 dark:bg-surface-muted-dark dark:text-gray-200"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content || (isLast && isStreaming ? <TypingIndicator /> : "")}</p>
            </div>
          </div>
        );
      })}
      {isStreaming && messages.length > 0 && messages[messages.length - 1].role === "user" && (
        <div className="flex justify-start">
          <div className="rounded-lg bg-gray-100 px-4 py-2 dark:bg-surface-muted-dark">
            <TypingIndicator />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * MessageInput — text input + send button for chat.
 */
function MessageInput({ onSend, disabled }: { onSend: (content: string) => void; disabled: boolean }) {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 border-t border-gray-200 p-4 dark:border-gray-700">
      <input
        data-testid="chat-input"
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escribe un mensaje..."
        disabled={disabled}
        className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-brand focus:outline-none dark:border-gray-600 dark:bg-surface-dark dark:text-gray-200"
      />
      <button
        data-testid="chat-send-btn"
        type="submit"
        disabled={disabled || !text.trim()}
        className="rounded bg-orange-brand px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
      >
        Enviar
      </button>
    </form>
  );
}

/**
 * ChatPage — hosts MessageList, MessageInput, ModelSelector, TypingIndicator.
 * AI-CHAT-2: ModelSelector visible for ADMIN, hidden for CAPTAIN.
 * AI-CHAT-3: Retry indicator + ModelNotFound error display.
 */
export function ChatPage() {
  const { token } = useAuth();
  const [selectedModel, setSelectedModel] = useState("gpt-4");
  const [models, setModels] = useState<string[]>([]);

  const { messages, status, error, availableModels, send } = useChatStream({
    token,
    model: selectedModel,
  });

  // Fetch available models on mount
  const fetchModels = useCallback(async () => {
    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/models`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { models: Array<{ id: string }>; defaults: Record<string, string> };
        const modelIds = data.models.map((m) => m.id);
        setModels(modelIds);
        if (modelIds.length > 0 && !modelIds.includes(selectedModel)) {
          setSelectedModel(modelIds[0]);
        }
      }
    } catch {
      // Silently fail — model selector will show empty
    }
  }, [token, selectedModel]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // When ModelNotFound returns availableModels, update the selector
  useEffect(() => {
    if (availableModels && availableModels.length > 0) {
      setModels(availableModels);
      setSelectedModel(availableModels[0]);
    }
  }, [availableModels]);

  const isRetrying = status === "retrying";
  const isStreaming = status === "streaming";
  const isError = status === "error";

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-surface-dark">
      {/* Header with model selector */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Chat IA</h2>
        <ModelSelector
          models={models}
          selectedModel={selectedModel}
          onSelect={setSelectedModel}
        />
      </div>

      {/* Retry indicator (AI-CHAT-3) */}
      {isRetrying && error && (
        <div
          data-testid="retry-indicator"
          className="mx-4 mt-3 rounded border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-700 dark:border-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400"
        >
          {error}
        </div>
      )}

      {/* ModelNotFound error (AI-CHAT-3) */}
      {isError && availableModels && (
        <div
          data-testid="model-error"
          className="mx-4 mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400"
        >
          <p className="font-medium">{error}</p>
          <p className="mt-1">El selector se ha actualizado con los modelos disponibles.</p>
        </div>
      )}

      {/* Generic error (non-ModelNotFound) */}
      {isError && !availableModels && !isRetrying && (
        <div className="mx-4 mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
          {error ?? "Error en la conversación"}
        </div>
      )}

      {/* Messages */}
      <MessageList messages={messages} isStreaming={isStreaming || isRetrying} />

      {/* Input */}
      <MessageInput onSend={send} disabled={isRetrying} />
    </div>
  );
}
