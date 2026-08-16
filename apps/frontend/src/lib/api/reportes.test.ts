import { describe, it, expect, vi, beforeEach } from "vitest";
import { downloadCenso } from "./reportes";

describe("downloadCenso", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => "blob:test");
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it("downloads blob and triggers file download", async () => {
    // Use string body instead of Blob — jsdom doesn't implement Blob.stream()
    const mockResponse = new Response("fake-xlsx-data", {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="censo-2026.xlsx"',
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

    const mockClick = vi.fn();
    const mockAnchor = { href: "", download: "", click: mockClick } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(mockAnchor);

    await downloadCenso("test-token");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/reportes/censo.xlsx",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-token" },
      }),
    );
    expect(mockClick).toHaveBeenCalled();
    expect(mockAnchor.download).toBe("censo-2026.xlsx");
  });

  it("falls back to default filename when no Content-Disposition", async () => {
    const mockResponse = new Response("data", {
      status: 200,
      headers: { "Content-Type": "application/octet-stream" },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

    const mockClick = vi.fn();
    const mockAnchor = { href: "", download: "", click: mockClick } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(mockAnchor);

    await downloadCenso("test-token");

    expect(mockAnchor.download).toBe(`censo-${new Date().getFullYear()}.xlsx`);
  });

  it("appends cabildoId query param when provided (XLSX-4)", async () => {
    const mockResponse = new Response("fake-xlsx-data", {
      status: 200,
      headers: { "Content-Type": "application/octet-stream" },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

    const mockClick = vi.fn();
    const mockAnchor = { href: "", download: "", click: mockClick } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(mockAnchor);

    await downloadCenso("test-token", "cabildo-1");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/reportes/censo.xlsx?cabildoId=cabildo-1",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-token" },
      }),
    );
  });

  it("throws ApiError on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(downloadCenso("bad-token")).rejects.toThrow();
  });
});
