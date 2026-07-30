import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { PrismaClient } from "@prisma/client";

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

    it("returns 401 for wrong password", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "admin@tatachio.com", password: "wrong" });

      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/auth/register", () => {
    it("returns 400 when required fields are missing", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "incomplete@test.com" });

      expect(res.status).toBe(400);
    });

    it("returns 201 for a new user", async () => {
      const res = await request(app)
        .post("/api/auth/register")
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

    it("returns 400 when email already exists", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email: "admin@tatachio.com",
          password: "password123",
          nombre: "Duplicate",
        });

      expect(res.status).toBe(400);
    });
  });
});
