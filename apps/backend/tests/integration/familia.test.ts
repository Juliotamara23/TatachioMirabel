import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { PrismaClient } from "@prisma/client";
import familiaRouter from "../../src/routes/familia.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";

const app = express();
app.use(express.json());
app.use("/api/familias", familiaRouter);
app.use(errorHandler);

describe("Familia API Integration", () => {
  let prisma: PrismaClient;
  let adminToken: string;
  let testCabildoId: string;
  let testFamiliaId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: "file:./test.db" } },
    });

    // Generate admin token
    const jwt = await import("jsonwebtoken");
    adminToken = jwt.default.sign(
      { id: "admin-id", rol: "ADMINISTRATOR" },
      process.env.JWT_SECRET || "test-secret"
    );

    // Create a test cabildo (needed for familia creation)
    const cabildo = await prisma.cabildo.create({
      data: {
        nombre: "Cabildo Familia Test",
        resguardo: "Resguardo FT",
        comunidad: "Comunidad FT",
        vigencia: 2026,
      },
    });
    testCabildoId = cabildo.id;
  });

  afterAll(async () => {
    // Clean up
    await prisma.familia.deleteMany({ where: { cabildoId: testCabildoId } });
    await prisma.cabildo.deleteMany({ where: { id: testCabildoId } });
    await prisma.$disconnect();
  });

  describe("POST /api/familias", () => {
    it("should create a familia and return 201", async () => {
      const res = await request(app)
        .post("/api/familias")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          numero: 42,
          direccion: "Calle Test 123",
          cabildoId: testCabildoId,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.numero).toBe(42);
      expect(res.body.cabildoId).toBe(testCabildoId);

      testFamiliaId = res.body.id;
    });

    it("should return 404 when cabildo does not exist", async () => {
      const res = await request(app)
        .post("/api/familias")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          numero: 1,
          cabildoId: "550e8400-e29b-41d4-a716-446655440000",
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Cabildo no encontrado");
    });

    it("should return 400 for invalid data", async () => {
      const res = await request(app)
        .post("/api/familias")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          numero: -1,
          cabildoId: "not-a-uuid",
        });

      expect(res.status).toBe(400);
    });

    it("should return 401 without auth", async () => {
      const res = await request(app)
        .post("/api/familias")
        .send({
          numero: 1,
          cabildoId: testCabildoId,
        });

      expect(res.status).toBe(401);
    });

    it("should return 403 for non-admin", async () => {
      const jwt = await import("jsonwebtoken");
      const capitanaToken = jwt.default.sign(
        { id: "cap-f", rol: "CAPTAIN" },
        process.env.JWT_SECRET || "test-secret"
      );

      const res = await request(app)
        .post("/api/familias")
        .set("Authorization", `Bearer ${capitanaToken}`)
        .send({
          numero: 99,
          cabildoId: testCabildoId,
        });

      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/familias", () => {
    it("should return 200 and list familias", async () => {
      const res = await request(app)
        .get("/api/familias")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("should filter by cabildoId query param", async () => {
      const res = await request(app)
        .get(`/api/familias?cabildoId=${testCabildoId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // All returned familias should belong to the test cabildo
      for (const f of res.body) {
        expect(f.cabildoId).toBe(testCabildoId);
      }
    });
  });

  describe("GET /api/familias/:id", () => {
    it("should return 200 for existing familia", async () => {
      // Ensure test familia exists
      if (!testFamiliaId) {
        const createRes = await request(app)
          .post("/api/familias")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            numero: 77,
            cabildoId: testCabildoId,
          });
        testFamiliaId = createRes.body.id;
      }

      const res = await request(app)
        .get(`/api/familias/${testFamiliaId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testFamiliaId);
    });

    it("should return 404 for non-existent familia", async () => {
      const res = await request(app)
        .get("/api/familias/00000000-0000-0000-0000-000000000000")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Familia no encontrada");
    });
  });

  describe("DELETE /api/familias/:id", () => {
    it("should delete a familia and return 204", async () => {
      // Create fresh familia for deletion
      const createRes = await request(app)
        .post("/api/familias")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          numero: 88,
          cabildoId: testCabildoId,
        });

      const deleteId = createRes.body.id;
      const res = await request(app)
        .delete(`/api/familias/${deleteId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
    });
  });
});
