import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../src/middleware/authMiddleware.js";
import familiaRouter from "../../src/routes/familia.js";
import memberRouter from "../../src/routes/member.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";

// Build minimal test app with both familia and member routes
const app = express();
app.use(express.json());
app.use("/api/familias", familiaRouter);
app.use("/api/miembros", memberRouter);
app.use(errorHandler);

describe("Family Business Rules Integration", () => {
  let prisma: PrismaClient;
  let adminToken: string;
  let testCabildoId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: "file:./test.db" } },
    });

    // Generate admin token
    adminToken = jwt.sign(
      { id: "admin-id", rol: "ADMINISTRATOR" },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

    // Create a test cabildo (needed for familia/member creation)
    const cabildo = await prisma.cabildo.create({
      data: {
        nombre: "Cabildo Family Rules Test",
        resguardo: "Resguardo FR",
        comunidad: "Comunidad FR",
        vigencia: 2026,
      },
    });
    testCabildoId = cabildo.id;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.miembro.deleteMany({ where: { cabildoId: testCabildoId } });
    await prisma.familia.deleteMany({ where: { cabildoId: testCabildoId } });
    await prisma.cabildo.deleteMany({ where: { id: testCabildoId } });
    await prisma.$disconnect();
  });

  // Helper to create a family
  async function createFamilia(numero: number): Promise<string> {
    const res = await request(app)
      .post("/api/familias")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        numero,
        direccion: `Direccion ${numero}`,
        cabildoId: testCabildoId,
      });
    expect(res.status).toBe(201);
    return res.body.id;
  }

  // Helper to get all families in cabildo
  async function getFamilias(): Promise<Array<{ id: string; numero: number }>> {
    const res = await request(app)
      .get(`/api/familias?cabildoId=${testCabildoId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    return res.body.map((f: { id: string; numero: number }) => ({
      id: f.id,
      numero: f.numero,
    }));
  }

  // Helper to create a member
  async function createMember(
    familiaId: string,
    overrides: Partial<{
      tipoIdentificacion: string;
      numeroDocumento: string;
      nombres: string;
      apellidos: string;
      fechaNacimiento: string;
      parentesco: string;
      sexo: string;
      integrantes: number;
      direccion: string;
      telefono: string;
    }> = {},
  ): Promise<{
    id: string;
    integrantes: number;
    familiaId: string;
    numeroFamilia: number | null;
  }> {
    const res = await request(app)
      .post("/api/miembros")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        familiaId,
        cabildoId: testCabildoId,
        tipoIdentificacion: "CC",
        numeroDocumento: `DOC${Date.now()}${Math.random()}`,
        nombres: "JUAN",
        apellidos: "PEREZ",
        fechaNacimiento: "01/01/1990",
        parentesco: "CF",
        sexo: "M",
        ...overrides,
      });
    expect(res.status).toBe(201);
    return {
      id: res.body.id,
      integrantes: res.body.integrantes,
      familiaId: res.body.familiaId,
      numeroFamilia: res.body.numeroFamilia ?? null,
    };
  }

  // Helper to get members of a family
  async function getMembers(
    familiaId: string,
  ): Promise<
    Array<{ id: string; integrantes: number; numeroFamilia: number | null }>
  > {
    const res = await request(app)
      .get(`/api/miembros?search=`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    return res.body
      .filter((m: { familiaId: string }) => m.familiaId === familiaId)
      .map(
        (m: {
          id: string;
          integrantes: number;
          numeroFamilia: number | null;
        }) => ({
          id: m.id,
          integrantes: m.integrantes,
          numeroFamilia: m.numeroFamilia,
        }),
      )
      .sort(
        (a: { integrantes: number }, b: { integrantes: number }) =>
          a.integrantes - b.integrantes,
      );
  }

  // Helper to delete a family
  async function deleteFamilia(familiaId: string): Promise<void> {
    const res = await request(app)
      .delete(`/api/familias/${familiaId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  }

  // Helper to delete a member
  async function deleteMember(memberId: string): Promise<void> {
    const res = await request(app)
      .delete(`/api/miembros/${memberId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  }

  // Helper to update a member
  async function updateMember(
    memberId: string,
    data: Record<string, unknown>,
  ): Promise<{
    integrantes: number;
    familiaId: string;
    numeroFamilia: number | null;
  }> {
    const res = await request(app)
      .put(`/api/miembros/${memberId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send(data);
    expect(res.status).toBe(200);
    return {
      integrantes: res.body.integrantes,
      familiaId: res.body.familiaId,
      numeroFamilia: res.body.numeroFamilia ?? null,
    };
  }

  describe("Test 1: Family renumbering on delete", () => {
    it("should renumber families without gaps when a middle family is deleted", async () => {
      // Create 3 families with numbers 1, 2, 3
      await createFamilia(1);
      const f2 = await createFamilia(2);
      await createFamilia(3);

      // Verify initial state
      let familias = await getFamilias();
      expect(familias.map((f) => f.numero).sort((a, b) => a - b)).toEqual([
        1, 2, 3,
      ]);

      // Delete family #2
      await deleteFamilia(f2);

      // Verify remaining families have numbers 1, 2 (not 1, 3)
      familias = await getFamilias();
      const numeros = familias.map((f) => f.numero).sort((a, b) => a - b);
      expect(numeros).toEqual([1, 2]);
    });
  });

  describe("Test 2: Auto integrantes on create", () => {
    it("should auto-assign sequential integrantes when creating members without specifying integrantes", async () => {
      // Create a family
      const familiaId = await createFamilia(10);

      // Create 3 members without specifying integrantes
      const m1 = await createMember(familiaId, {
        numeroDocumento: "DOC1",
        nombres: "JUAN",
      });
      const m2 = await createMember(familiaId, {
        numeroDocumento: "DOC2",
        nombres: "MARIA",
      });
      const m3 = await createMember(familiaId, {
        numeroDocumento: "DOC3",
        nombres: "PEDRO",
      });

      // Verify integrantes are 1, 2, 3 (auto-assigned)
      expect(m1.integrantes).toBe(1);
      expect(m2.integrantes).toBe(2);
      expect(m3.integrantes).toBe(3);

      // Also verify by querying
      const members = await getMembers(familiaId);
      expect(members.map((m) => m.integrantes)).toEqual([1, 2, 3]);
    });
  });

  describe("Test 3: Auto integrantes on delete", () => {
    it("should renumber integrantes without gaps when a middle member is deleted", async () => {
      // Create a family
      const familiaId = await createFamilia(20);

      // Create 3 members (integrantes 1, 2, 3)
      const m1 = await createMember(familiaId, {
        numeroDocumento: "DEL1",
        nombres: "UNO",
      });
      const m2 = await createMember(familiaId, {
        numeroDocumento: "DEL2",
        nombres: "DOS",
      });
      const m3 = await createMember(familiaId, {
        numeroDocumento: "DEL3",
        nombres: "TRES",
      });

      expect(m1.integrantes).toBe(1);
      expect(m2.integrantes).toBe(2);
      expect(m3.integrantes).toBe(3);

      // Delete member #2
      await deleteMember(m2.id);

      // Verify remaining members have integrantes 1, 2 (not 1, 3)
      const members = await getMembers(familiaId);
      expect(members.map((m) => m.integrantes)).toEqual([1, 2]);
      expect(members.length).toBe(2);
    });
  });

  describe("Test 4: Auto integrantes on family change", () => {
    it("should recalculate integrantes in both source and destination families when member moves", async () => {
      // Create 2 families
      const familiaA = await createFamilia(100);
      const familiaB = await createFamilia(101);

      // Create 2 members in family A (integrantes 1, 2)
      const mA1 = await createMember(familiaA, {
        numeroDocumento: "MOV1",
        nombres: "FAM_A_UNO",
      });
      const mA2 = await createMember(familiaA, {
        numeroDocumento: "MOV2",
        nombres: "FAM_A_DOS",
      });

      // Create 1 member in family B (integrantes 1)
      const mB1 = await createMember(familiaB, {
        numeroDocumento: "MOV3",
        nombres: "FAM_B_UNO",
      });

      expect(mA1.integrantes).toBe(1);
      expect(mA2.integrantes).toBe(2);
      expect(mB1.integrantes).toBe(1);

      // Move member #2 from family A to family B
      await updateMember(mA2.id, { familiaId: familiaB });

      // Verify family A has 1 member with integrantes 1
      let membersA = await getMembers(familiaA);
      expect(membersA.length).toBe(1);
      expect(membersA[0].integrantes).toBe(1);

      // Verify family B has 2 members with integrantes 1, 2
      const membersB = await getMembers(familiaB);
      expect(membersB.length).toBe(2);
      expect(membersB.map((m) => m.integrantes)).toEqual([1, 2]);
    });
  });

  describe("Test 5: numeroFamilia snapshot on ALTA/BAJA", () => {
    it("should preserve numeroFamilia snapshot when family is renumbered after member transitions", async () => {
      // Create a family with number 3
      const familiaId = await createFamilia(3);

      // Create a member in that family
      const member = await createMember(familiaId, {
        numeroDocumento: "SNAP1",
        nombres: "SNAPSHOT",
      });
      expect(member.numeroFamilia).toBeNull(); // Initially no snapshot

      // Update member estado to BAJA - should snapshot familia.numero (3)
      const updated = await updateMember(member.id, { estado: "BAJA" });
      expect(updated.numeroFamilia).toBe(3);

      // Verify the member still belongs to the family
      expect(updated.familiaId).toBe(familiaId);

      // Create another family #4
      const familia4 = await createFamilia(4);

      // Move member to family #4 (so we can delete family #3)
      // This should not change numeroFamilia (it's a snapshot)
      await updateMember(member.id, { familiaId: familia4 });

      // Now delete family #3 (empty, triggers renumbering of #4 to #3)
      await deleteFamilia(familiaId);

      // Verify member's numeroFamilia is still 3 (snapshot preserved)
      const memberAfter = await request(app)
        .get(`/api/miembros/${member.id}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(memberAfter.status).toBe(200);
      expect(memberAfter.body.numeroFamilia).toBe(3);

      // Also verify family #4 was renumbered to #3
      const familias = await getFamilias();
      expect(familias.find((f) => f.id === familia4)?.numero).toBe(3);
    });
  });
});
