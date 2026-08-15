import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { cabildoSchema, familiaSchema, memberSchema, ageFromFechaNacimiento, MAX_PLAUSIBLE_AGE_YEARS } from "@tatachio/shared";
import { resolveReportesDir, validateReportesDirPath, REPORTES_DIR_ENV } from "@tatachio/shared/node";

describe("cabildoSchema", () => {
  it("should accept valid cabildo data", () => {
    const valid = {
      nombre: "Tatachio Mirabel",
      resguardo: "Resguardo Tatachio",
      comunidad: "Comunidad Tatachio",
      vigencia: 2026,
    };

    const result = cabildoSchema.parse(valid);

    expect(result.nombre).toBe("Tatachio Mirabel");
    expect(result.resguardo).toBe("Resguardo Tatachio");
    expect(result.comunidad).toBe("Comunidad Tatachio");
    expect(result.vigencia).toBe(2026);
  });

  it("should reject empty nombre", () => {
    const invalid = {
      nombre: "",
      resguardo: "Resguardo Test",
      comunidad: "Comunidad Test",
      vigencia: 2026,
    };

    expect(() => cabildoSchema.parse(invalid)).toThrow();
  });

  it("should reject vigencia out of range", () => {
    const invalid = {
      nombre: "Test",
      resguardo: "R",
      comunidad: "C",
      vigencia: 1800,
    };

    expect(() => cabildoSchema.parse(invalid)).toThrow();
  });
});

describe("familiaSchema", () => {
  it("should accept valid familia data", () => {
    const valid = {
      numero: 1,
      direccion: "Calle 10 #5-20",
      telefono: "3112223344",
      cabildoId: "123e4567-e89b-12d3-a456-426614174000",
    };

    const result = familiaSchema.parse(valid);

    expect(result.numero).toBe(1);
    expect(result.direccion).toBe("Calle 10 #5-20");
    expect(result.telefono).toBe("3112223344");
    expect(result.cabildoId).toBe("123e4567-e89b-12d3-a456-426614174000");
  });

  it("should reject negative numero", () => {
    const invalid = {
      numero: -1,
      cabildoId: "123e4567-e89b-12d3-a456-426614174000",
    };

    expect(() => familiaSchema.parse(invalid)).toThrow();
  });

  it("should reject non-uuid cabildoId", () => {
    const invalid = {
      numero: 1,
      cabildoId: "not-a-uuid",
    };

    expect(() => familiaSchema.parse(invalid)).toThrow();
  });

  it("should accept familia with only required fields (no direccion, no telefono)", () => {
    const minimal = {
      numero: 5,
      cabildoId: "550e8400-e29b-41d4-a716-446655440000",
    };

    const result = familiaSchema.parse(minimal);

    expect(result.numero).toBe(5);
    expect(result.direccion).toBeUndefined();
    expect(result.telefono).toBeUndefined();
  });
});

describe("memberSchema", () => {
  const validMemberBase = {
    tipoIdentificacion: "CC" as const,
    numeroDocumento: "12345678",
    nombres: "Juan",
    apellidos: "Perez",
    fechaNacimiento: "01/01/1990",
    parentesco: "PA" as const,
    sexo: "M" as const,
    integrantes: 3,
    familiaId: "123e4567-e89b-12d3-a456-426614174000",
  };

  it("should accept valid member data with cabildoId", () => {
    const valid = {
      ...validMemberBase,
      cabildoId: "123e4567-e89b-12d3-a456-426614174000",
    };

    const result = memberSchema.parse(valid);

    expect(result.cabildoId).toBe("123e4567-e89b-12d3-a456-426614174000");
  });

  it("should accept valid member data without cabildoId (optional)", () => {
    const valid = { ...validMemberBase };

    const result = memberSchema.parse(valid);

    expect(result.cabildoId).toBeUndefined();
  });

  it("should reject invalid cabildoId format when provided", () => {
    const invalid = {
      ...validMemberBase,
      cabildoId: "not-a-uuid",
    };

    expect(() => memberSchema.parse(invalid)).toThrow();
  });

  it("should reject calendar-invalid date (Feb 31)", () => {
    const invalid = { ...validMemberBase, fechaNacimiento: "31/02/1990" };
    expect(() => memberSchema.parse(invalid)).toThrow();
  });

  it("should reject future date", () => {
    const invalid = { ...validMemberBase, fechaNacimiento: "01/01/2030" };
    expect(() => memberSchema.parse(invalid)).toThrow();
  });

  it("should accept oldest real census record (09/07/1931)", () => {
    const valid = { ...validMemberBase, fechaNacimiento: "09/07/1931" };
    const result = memberSchema.parse(valid);
    expect(result.fechaNacimiento).toBe("09/07/1931");
  });

  it("should accept old-but-plausible date (1919)", () => {
    const valid = { ...validMemberBase, fechaNacimiento: "28/11/1919" };
    const result = memberSchema.parse(valid);
    expect(result.fechaNacimiento).toBe("28/11/1919");
  });
});

describe("ageFromFechaNacimiento", () => {
  it("returns 0 for today", () => {
    const now = new Date();
    const d = String(now.getUTCDate()).padStart(2, "0");
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const y = now.getUTCFullYear();
    expect(ageFromFechaNacimiento(`${d}/${m}/${y}`)).toBe(0);
  });

  it("computes exact age for known date", () => {
    const now = new Date();
    const age = ageFromFechaNacimiento("09/07/1931");
    expect(age).toBe(now.getUTCFullYear() - 1931 - (now.getUTCMonth() < 6 ? 1 : 0));
  });

  it("flags >99 as warning-level age", () => {
    expect(ageFromFechaNacimiento("01/01/1900")).toBeGreaterThan(MAX_PLAUSIBLE_AGE_YEARS);
    expect(ageFromFechaNacimiento("01/01/1935")).toBeLessThanOrEqual(MAX_PLAUSIBLE_AGE_YEARS);
  });
});

describe("resolveReportesDir", () => {
  it("defaults to ~/.tatachio/reportes when TATACHIO_REPORTES_DIR is not set", () => {
    expect(resolveReportesDir({})).toBe(join(homedir(), ".tatachio", "reportes"));
    expect(resolveReportesDir()).toBe(join(homedir(), ".tatachio", "reportes"));
  });

  it("uses TATACHIO_REPORTES_DIR when set to a valid absolute path", () => {
    expect(resolveReportesDir({ [REPORTES_DIR_ENV]: "/custom/reportes" })).toBe("/custom/reportes");
  });

  it("trims whitespace around a valid absolute path", () => {
    expect(resolveReportesDir({ [REPORTES_DIR_ENV]: "  /custom/reportes  " })).toBe("/custom/reportes");
  });

  it("throws when TATACHIO_REPORTES_DIR is set to an empty string (issue #66)", () => {
    expect(() => resolveReportesDir({ [REPORTES_DIR_ENV]: "" })).toThrow(/TATACHIO_REPORTES_DIR/);
  });

  it("throws when TATACHIO_REPORTES_DIR is whitespace-only (issue #66)", () => {
    expect(() => resolveReportesDir({ [REPORTES_DIR_ENV]: "   " })).toThrow(/TATACHIO_REPORTES_DIR/);
  });

  it("throws when TATACHIO_REPORTES_DIR is a relative path (issue #66)", () => {
    expect(() => resolveReportesDir({ [REPORTES_DIR_ENV]: "reportes" })).toThrow(/absolute path/);
    expect(() => resolveReportesDir({ [REPORTES_DIR_ENV]: "./reportes" })).toThrow(/absolute path/);
  });
});

describe("validateReportesDirPath", () => {
  it("returns the trimmed path when valid", () => {
    expect(validateReportesDirPath("/abs/path", "--output")).toBe("/abs/path");
    expect(validateReportesDirPath("  /abs/path  ", "--output")).toBe("/abs/path");
  });

  it("throws on empty string naming the source", () => {
    expect(() => validateReportesDirPath("", "--output")).toThrow(/--output cannot be empty/);
    expect(() => validateReportesDirPath("", "TATACHIO_REPORTES_DIR")).toThrow(
      /TATACHIO_REPORTES_DIR cannot be empty/,
    );
  });

  it("throws on whitespace-only string", () => {
    expect(() => validateReportesDirPath("   ", "--output")).toThrow(/--output cannot be empty/);
  });

  it("throws on relative path, including the offending value in the message", () => {
    expect(() => validateReportesDirPath("relative/path", "--output")).toThrow(
      /absolute path.*relative\/path/,
    );
    expect(() => validateReportesDirPath("./out.xlsx", "--output")).toThrow(/absolute path/);
  });
});
