import { execSync } from "node:child_process";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

/**
 * Test database setup — runs once before all test suites.
 *
 * Creates a fresh test.db with the current Prisma schema.
 * Uses a separate database from mirabel.db (production data).
 */
export async function setup() {
  const testDbUrl = "file:./test.db";

  // Push schema to test database (idempotent)
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: "pipe",
  });

  // Seed minimal test data
  const prisma = new PrismaClient({
    datasources: { db: { url: testDbUrl } },
  });

  const passwordHash = await bcrypt.hash("admin123", 10);

  // Ensure admin user exists for auth tests
  await prisma.usuario.upsert({
    where: { email: "admin@tatachio.com" },
    update: { passwordHash, rol: "ADMINISTRADOR" },
    create: {
      email: "admin@tatachio.com",
      passwordHash,
      nombre: "Admin Test",
      rol: "ADMINISTRADOR",
    },
  });

  // Ensure a test cabildo exists
  await prisma.cabildo.upsert({
    where: { id: "test-cabildo-id" },
    update: {},
    create: {
      id: "test-cabildo-id",
      nombre: "Cabildo Test",
      resguardo: "Resguardo Test",
      comunidad: "Comunidad Test",
      vigencia: 2026,
    },
  });

  await prisma.$disconnect();
}

export async function teardown() {
  try {
    const fs = await import("node:fs/promises");
    await fs.unlink("test.db").catch(() => {});
    await fs.unlink("test.db-journal").catch(() => {});
  } catch {
    // Ignore cleanup errors
  }
}
