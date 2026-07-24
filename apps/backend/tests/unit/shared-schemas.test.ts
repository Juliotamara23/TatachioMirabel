import { describe, it, expect } from "vitest";
import { cabildoSchema, familiaSchema } from "@tatachio/shared";

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
