import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../src/middleware/authMiddleware.js";

// Build a minimal app for testing (isolated from the running server)
const app = express();
app.use(express.json());

// We import the actual routes
import authRouter from "../../src/routes/auth.js";

app.use("/api/auth", authRouter);

describe("Auth API", () => {
  let prisma: PrismaClient;
  const testEmail = `test-${Date.now()}@test.com`;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: "file:./test.db" } },
    });
  });

  afterAll(async () => {
    // Clean up created test user
    await prisma.usuario.deleteMany({
      where: { email: { contains: "@test.com" } },
    });
    await prisma.$disconnect();
  });

  describe("POST /api/auth/login", () => {
    it("returns 400 when email is missing", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ password: "admin123" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("returns 400 when password is missing", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "admin@tatachio.com" });

      expect(res.status).toBe(400);
    });

    it("returns 200 and a token for valid credentials", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "admin@tatachio.com", password: "admin123" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("token");
      expect(typeof res.body.token).toBe("string");
    });

    it("returns a user object alongside the token (fixes latent CLI login bug)", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "admin@tatachio.com", password: "admin123" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("user");
      const { user } = res.body;
      expect(user).toHaveProperty("id");
      expect(user).toHaveProperty("email", "admin@tatachio.com");
      expect(user).toHaveProperty("nombre");
      expect(user).toHaveProperty("rol", "ADMINISTRATOR");
      // ADMINISTRATOR has no cabildo assignment — must be null, not undefined
      expect("cabildoId" in user).toBe(true);
      // Never leak passwordHash or the raw cabildos array
      expect(user).not.toHaveProperty("passwordHash");
      expect(user).not.toHaveProperty("cabildos");
    });

    it("returns 401 for wrong password", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "admin@tatachio.com", password: "wrong" });

      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/auth/register", () => {
    // Registration is admin-only (issue #38): the route requires a valid
    // Bearer token (authMiddleware) AND rol === "ADMINISTRATOR" (isAdmin).
    // The middleware only inspects the JWT role claim — no DB lookup — so a
    // signed token with the ADMINISTRATOR role is enough to pass.
    const adminToken = jwt.sign(
      { id: "test-admin-id", rol: "ADMINISTRATOR", cabildoId: null },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    const captainToken = jwt.sign(
      { id: "test-captain-id", rol: "CAPTAIN", cabildoId: null },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    it("returns 401 when no token is provided", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email: "anon@test.com",
          password: "password123",
          nombre: "Anonymous",
          rol: "ADMINISTRATOR",
        });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty("error");
    });

    it("returns 403 when token rol is not ADMINISTRATOR", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .set("Authorization", `Bearer ${captainToken}`)
        .send({
          email: "captain@test.com",
          password: "password123",
          nombre: "Captain",
          rol: "ADMINISTRATOR",
        });

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty("error");
    });

    it("returns 400 when required fields are missing (admin token)", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ email: "incomplete@test.com" });

      expect(res.status).toBe(400);
    });

    it("returns 201 for a new user (admin token)", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          email: testEmail,
          password: "password123",
          nombre: "Test User",
          rol: "ADMINISTRATOR",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body).not.toHaveProperty("passwordHash");
    });

    it("returns 409 when email already exists (admin token)", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          email: "admin@tatachio.com",
          password: "password123",
          nombre: "Duplicate",
          rol: "ADMINISTRATOR",
        });

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty("error");
    });

    // ── Captain business rules (issue #72) ────────────────────────────────

    it("returns 400 when CAPTAIN is registered without cabildoId", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          email: `captain-nocabildo-${Date.now()}@test.com`,
          password: "password123",
          nombre: "Captain No Cabildo",
          rol: "CAPTAIN",
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("returns 400 when CAPTAIN is registered with a non-existent cabildoId", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          email: `captain-badcabildo-${Date.now()}@test.com`,
          password: "password123",
          nombre: "Captain Bad Cabildo",
          rol: "CAPTAIN",
          cabildoId: "00000000-0000-0000-0000-000000000000",
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("returns 400 when ADMINISTRATOR is registered with cabildoId", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          email: `admin-withcabildo-${Date.now()}@test.com`,
          password: "password123",
          nombre: "Admin With Cabildo",
          rol: "ADMINISTRATOR",
          cabildoId: "test-cabildo-id",
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });
  });
});
