import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReportesPage } from "./ReportesPage";
import { ToastProvider } from "../../contexts/ToastContext";

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

// Mock CabildoContext — a cabildo is selected, so downloads are scoped (XLSX-4)
vi.mock("../../contexts/CabildoContext", () => ({
  useCabildo: () => ({
    selectedId: "cabildo-1",
    list: [{ id: "cabildo-1", nombre: "Test" }],
  }),
}));

function renderPage() {
  return render(
    <ToastProvider>
      <ReportesPage />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReportesPage", () => {
  it("renders the reportes page with censo download button", () => {
    renderPage();

    expect(screen.getByText("Reportes")).toBeInTheDocument();
    expect(screen.getByTestId("censo-download-btn")).toBeInTheDocument();
  });

  it("triggers censo download scoped to the selected cabildo when clicked (XLSX-4)", async () => {
    const user = userEvent.setup();
    mockDownloadCenso.mockResolvedValue(undefined);

    renderPage();

    await user.click(screen.getByTestId("censo-download-btn"));

    expect(mockDownloadCenso).toHaveBeenCalledWith("test-token", "cabildo-1");
  });

  it("shows a success toast after a successful download (TOAST-2)", async () => {
    const user = userEvent.setup();
    mockDownloadCenso.mockResolvedValue(undefined);

    renderPage();

    await user.click(screen.getByTestId("censo-download-btn"));

    expect(await screen.findByText("Censo exportado correctamente")).toBeInTheDocument();
  });

  it("shows loading state during download", async () => {
    const user = userEvent.setup();
    let resolveDownload: () => void;
    mockDownloadCenso.mockReturnValue(new Promise<void>((resolve) => { resolveDownload = resolve; }));

    renderPage();

    await user.click(screen.getByTestId("censo-download-btn"));

    // Button should show loading state
    const btn = screen.getByTestId("censo-download-btn");
    expect(btn).toBeDisabled();

    // Resolve the download
    resolveDownload!();
  });
});
