import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReportesPage } from "./ReportesPage";

// Mock downloadCenso
const mockDownloadCenso = vi.fn();
vi.mock("../../lib/api/reportes", () => ({
  downloadCenso: (...args: unknown[]) => mockDownloadCenso(...args),
}));

// Mock AuthContext
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    token: "test-token",
    user: { id: "u1", email: "admin@test.com", nombre: "Admin", rol: "ADMINISTRATOR" },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReportesPage", () => {
  it("renders the reportes page with censo download button", () => {
    render(<ReportesPage />);

    expect(screen.getByText("Reportes")).toBeInTheDocument();
    expect(screen.getByTestId("censo-download-btn")).toBeInTheDocument();
  });

  it("triggers censo download when button is clicked", async () => {
    const user = userEvent.setup();
    mockDownloadCenso.mockResolvedValue(undefined);

    render(<ReportesPage />);

    await user.click(screen.getByTestId("censo-download-btn"));

    expect(mockDownloadCenso).toHaveBeenCalledWith("test-token");
  });

  it("shows loading state during download", async () => {
    const user = userEvent.setup();
    let resolveDownload: () => void;
    mockDownloadCenso.mockReturnValue(new Promise<void>((resolve) => { resolveDownload = resolve; }));

    render(<ReportesPage />);

    await user.click(screen.getByTestId("censo-download-btn"));

    // Button should show loading state
    const btn = screen.getByTestId("censo-download-btn");
    expect(btn).toBeDisabled();

    // Resolve the download
    resolveDownload!();
  });
});
