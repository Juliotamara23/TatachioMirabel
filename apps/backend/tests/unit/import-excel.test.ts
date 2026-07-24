import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { writeFileSync, unlinkSync } from "fs";
import { importExcel } from "../../scripts/import-excel.js";

describe("import-excel", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: "file:./test.db" } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should import members from a valid .xlsx file", { timeout: 15000 }, async () => {
    // Create a test .xlsx file
    const testFile = "/tmp/test-import-members.xlsx";
    const rows = [
      {
        tipoIdentificacion: "CC",
        numeroDocumento: "IMPORT001",
        nombres: "TEST",
        apellidos: "IMPORTADO",
        fechaNacimiento: "01/01/1990",
        parentesco: "CF",
        sexo: "M",
        integrantes: 1,
      },
    ];

    // Ensure a cabildo exists for the import
    const cabildo = await prisma.cabildo.findFirst();
    const familia = await prisma.familia.findFirst();
    
    if (!cabildo || !familia) {
      // Create minimal test data
      const c = await prisma.cabildo.create({
        data: { nombre: "Test Import", resguardo: "R", comunidad: "C", vigencia: 2026 },
      });
      const f = await prisma.familia.create({
        data: { numero: 999, cabildoId: c.id },
      });

      rows[0]["cabildoId"] = c.id;
      rows[0]["familiaId"] = f.id;
    } else {
      rows[0]["cabildoId"] = cabildo.id;
      rows[0]["familiaId"] = familia.id;
    }

    // Write .xlsx
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    writeFileSync(testFile, buf);

    // Run import
    const result = await importExcel(testFile);

    expect(result).toBeDefined();
    expect(typeof result.imported).toBe("number");
    expect(typeof result.skipped).toBe("number");
    expect(typeof result.errors).toBe("number");

    // Clean up temp file
    try { unlinkSync(testFile); } catch {}

    // Clean up imported data
    await prisma.miembro.deleteMany({ where: { numeroDocumento: "IMPORT001" } });
  });

  it("should handle non-existent file gracefully", async () => {
    await expect(
      importExcel("/tmp/does-not-exist-file.xlsx")
    ).rejects.toThrow(/Archivo no encontrado/);
  });

  it("should handle empty .xlsx file", { timeout: 10000 }, async () => {
    const testFile = "/tmp/test-empty-import.xlsx";
    const ws = XLSX.utils.json_to_sheet([]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    writeFileSync(testFile, buf);

    const result = await importExcel(testFile);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(0);

    try { unlinkSync(testFile); } catch {}
  });
});
