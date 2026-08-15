import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ModelSelector } from "./ModelSelector";

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

describe("ModelSelector", () => {
  it("renders models dropdown for ADMIN user", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u1", email: "admin@test.com", nombre: "Admin", rol: "ADMINISTRATOR" },
    });

    render(
      <ModelSelector
        models={["gpt-4", "claude-3"]}
        selectedModel="gpt-4"
        onSelect={vi.fn()}
      />,
    );

    const select = screen.getByTestId("model-selector");
    expect(select).toBeInTheDocument();
    expect(screen.getByText("gpt-4")).toBeInTheDocument();
    expect(screen.getByText("claude-3")).toBeInTheDocument();
  });

  it("is hidden for CAPTAIN users (AI-CHAT-2)", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u2", email: "cap@test.com", nombre: "Captain", rol: "CAPTAIN" },
    });

    const { container } = render(
      <ModelSelector
        models={["gpt-4"]}
        selectedModel="gpt-4"
        onSelect={vi.fn()}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("calls onSelect when model changes", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u1", email: "admin@test.com", nombre: "Admin", rol: "ADMINISTRATOR" },
    });

    const onSelect = vi.fn();
    render(
      <ModelSelector
        models={["gpt-4", "claude-3"]}
        selectedModel="gpt-4"
        onSelect={onSelect}
      />,
    );

    const select = screen.getByTestId("model-selector") as HTMLSelectElement;
    select.value = "claude-3";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onSelect).toHaveBeenCalledWith("claude-3");
  });
});
