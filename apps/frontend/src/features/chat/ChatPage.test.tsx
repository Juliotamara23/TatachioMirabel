import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatPage } from "./ChatPage";

// Mock useChatStream
const mockSend = vi.fn();
const mockReset = vi.fn();
const mockUseChatStream = vi.fn();
vi.mock("../../hooks/useChatStream", () => ({
  useChatStream: (opts: unknown) => mockUseChatStream(opts),
}));

// Mock AuthContext
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    token: "test-token",
    user: { id: "u1", email: "admin@test.com", nombre: "Admin", rol: "ADMINISTRATOR" },
  }),
}));

// Mock fetch for GET /api/models
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChatStream.mockReturnValue({
      messages: [],
      status: "idle" as const,
      error: null,
      availableModels: null,
      send: mockSend,
      reset: mockReset,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [{ id: "gpt-4" }, { id: "claude-3" }],
          defaults: { ADMINISTRATOR: "gpt-4", CAPTAIN: "claude-3" },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      ),
    );
  });

describe("ChatPage", () => {
  it("renders the chat interface with model selector", async () => {
    render(<ChatPage />);

    // Model selector visible for admin
    await waitFor(() => {
      expect(screen.getByTestId("model-selector")).toBeInTheDocument();
    });

    // Input area
    expect(screen.getByTestId("chat-input")).toBeInTheDocument();
    expect(screen.getByTestId("chat-send-btn")).toBeInTheDocument();
  });

  it("shows retry indicator when status is retrying (AI-CHAT-3)", async () => {
    mockUseChatStream.mockReturnValue({
      messages: [{ role: "user", content: "test" }],
      status: "retrying",
      error: "Reintentando en 5s...",
      availableModels: null,
      send: mockSend,
      reset: mockReset,
    });

    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId("retry-indicator")).toBeInTheDocument();
      expect(screen.getByText(/Reintentando en 5s/)).toBeInTheDocument();
    });
  });

  it("shows ModelNotFound error with available models dropdown (AI-CHAT-3)", async () => {
    mockUseChatStream.mockReturnValue({
      messages: [],
      status: "error",
      error: "Model 'unknown' not found",
      availableModels: ["gpt-4", "claude-3"],
      send: mockSend,
      reset: mockReset,
    });

    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId("model-error")).toBeInTheDocument();
      expect(screen.getByText(/not found/)).toBeInTheDocument();
    });
  });

  it("sends message when form is submitted", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId("chat-input")).toBeInTheDocument();
    });

    const input = screen.getByTestId("chat-input");
    await user.type(input, "Hello, AI!");
    await user.click(screen.getByTestId("chat-send-btn"));

    expect(mockSend).toHaveBeenCalledWith("Hello, AI!");
  });

  it("displays streaming messages progressively", async () => {
    mockUseChatStream.mockReturnValue({
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello there!" },
      ],
      status: "done",
      error: null,
      availableModels: null,
      send: mockSend,
      reset: mockReset,
    });

    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByText("Hi")).toBeInTheDocument();
      expect(screen.getByText("Hello there!")).toBeInTheDocument();
    });
  });

  it("shows typing indicator when streaming", async () => {
    mockUseChatStream.mockReturnValue({
      messages: [{ role: "assistant", content: "" }],
      status: "streaming",
      error: null,
      availableModels: null,
      send: mockSend,
      reset: mockReset,
    });

    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId("typing-indicator")).toBeInTheDocument();
    });
  });
});
