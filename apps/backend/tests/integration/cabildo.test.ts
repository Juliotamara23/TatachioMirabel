import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { PrismaClient } from "@prisma/client";
import cabildoRouter from "../../src/routes/cabildo.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";

const app = express();
app.use(express.json());
app.use("/api/cabildos", cabildoRouter);
app.use(errorHandler);

describe("Cabildo API Integration", () => {
  let prisma: PrismaClient;
  let adminToken: string;
  let testCabildoId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: "file:./test.db" } },
    });

    // Login as admin to get token
    const loginRes = await request(app)
      .post("/api/auth/login")  // This won't work since auth route isn't mounted
      .send({ email: "admin@tatachio.com", password: "admin123" });

    // Generate token directly since auth routes aren't mounted in this app
    const jwt = await import("jsonwebtoken");
    adminToken = jwt.default.sign(
      { id: "admin-id", rol: "ADMINISTRADOR" },
      process.env.JWT_SECRET || "test-secret"
    );
  });

  afterAll(async () => {
    // Clean up test data
    if (testCabildoId) {
      await prisma.cabildo.deleteMany({ where: { id: testCabildoId } });
    }
    await prisma.$disconnect();
  });

  describe("POST /api/cabildos", () => {
    it("should create a cabildo and return 201", async () => {
      const res = await request(app)
        .post("/api/cabildos")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          nombre: "Cabildo Integracion",
          resguardo: "Resguardo Test Int",
          comunidad: "Comunidad Test Int",
          vigencia: 2026,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.nombre).toBe("Cabildo Integracion");
      expect(res.body.comunidad).toBe("Comunidad Test Int");

      testCabildoId = res.body.id;
    });

    it("should return 401 without auth token", async () => {
      const res = await request(app)
        .post("/api/cabildos")
        .send({
          nombre: "Cabildo Sin Auth",
          resguardo: "R",
          comunidad: "C",
          vigencia: 2025,
        });

      expect(res.status).toBe(401);
    });

    it("should return 400 for invalid data (empty nombre)", async () => {
      const res = await request(app)
        .post("/api/cabildos")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          nombre: "",
          resguardo: "R",
          comunidad: "C",
          vigencia: 2025,
        });

      expect(res.status).toBe(400);
    });

    it("should return 403 for non-admin user", async () => {
      const jwt = await import("jsonwebtoken");
      const capitanaToken = jwt.default.sign(
        { id: "cap-1", rol: "CAPITANA" },
        process.env.JWT_SECRET || "test-secret"
      );

      const res = await request(app)
        .post("/api/cabildos")
        .set("Authorization", `Bearer ${capitanaToken}`)
        .send({
          nombre: "Cabildo Capitana",
          resguardo: "R",
          comunidad: "C",
          vigencia: 2026,
        });

      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/cabildos", () => {
    it("should return 200 and list cabildos", async () => {
      const res = await request(app)
        .get("/api/cabildos")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("should return 401 without auth", async () => {
      const res = await request(app).get("/api/cabildos");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/cabildos/:id", () => {
    it("should return 200 for existing cabildo", async () => {
      // Ensure we have a test cabildo
      if (!testCabildoId) {
        const createRes = await request(app)
          .post("/api/cabildos")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            nombre: "Cabildo Get Test",
            resguardo: "RGT",
            comunidad: "CGT",
            vigencia: 2026,
          });
        testCabildoId = createRes.body.id;
      }

      const res = await request(app)
        .get(`/api/cabildos/${testCabildoId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testCabildoId);
    });

    it("should return 404 for non-existent cabildo", async () => {
      const res = await request(app)
        .get("/api/cabildos/00000000-0000-0000-0000-000000000000")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Cabildo no encontrado");
    });
  });

  describe("PUT /api/cabildos/:id", () => {
    it("should update a cabildo and return 200", async () => {
      if (!testCabildoId) {
        const createRes = await request(app)
          .post("/api/cabildos")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            nombre: "Cabildo Update Test",
            resguardo: "RUT",
            comunidad: "CUT",
            vigencia: 2026,
          });
        testCabildoId = createRes.body.id;
      }

      const res = await request(app)
        .put(`/api/cabildos/${testCabildoId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ nombre: "Cabildo Actualizado" });

      expect(res.status).toBe(200);
      expect(res.body.nombre).toBe("Cabildo Actualizado");
    });

    it("should return 403 for non-admin", async () => {
      const jwt = await import("jsonwebtoken");
      const capitanaToken = jwt.default.sign(
        { id: "cap-2", rol: "CAPITANA" },
        process.env.JWT_SECRET || "test-secret"
      );

      const res = await request(app)
        .put(`/api/cabildos/${testCabildoId || "fake-id"}`)
        .set("Authorization", `Bearer ${capitanaToken}`)
        .send({ nombre: "Intento Capitana" });

      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /api/cabildos/:id", () => {
    it("should delete a cabildo and return 204", async () => {
      // Create a fresh cabildo just for deletion
      const createRes = await request(app)
        .post("/api/cabildos")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          nombre: "Cabildo Delete Test",
          resguardo: "RDT",
          comunidad: "CDT",
          vigencia: 2026,
        });

      const deleteId = createRes.body.id;
      const res = await request(app)
        .delete(`/api/cabildos/${deleteId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
    });

    it("should return 403 for non-admin on delete", async () => {
      const jwt = await import("jsonwebtoken");
      const capitanaToken = jwt.default.sign(
        { id: "cap-3", rol: "CAPITANA" },
        process.env.JWT_SECRET || "test-secret"
      );

      const res = await request(app)
        .delete("/api/cabildos/fake-id")
        .set("Authorization", `Bearer ${capitanaToken}`);

      expect(res.status).toBe(403);
    });
  });
});
