#!/usr/bin/env node
/**
 * seed-db.mjs — Populates qa.db from fixtures/seed.json via Prisma Client.
 *
 * Pragmatic exception: uses Prisma Client directly (infrastructure, not testing).
 * Same pattern as apps/backend/tests/setup.ts.
 *
 * Usage: node scripts/qa/lib/seed-db.mjs [dbPath]
 *   dbPath defaults to scripts/qa/qa.db
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");
const backendDir = join(projectRoot, "apps", "backend");

// ── Resolve dependencies from backend's node_modules ────────────────
const backendRequire = createRequire(join(backendDir, "package.json"));

let bcrypt;
let PrismaClient;
try {
  bcrypt = backendRequire("bcryptjs");
  const prismaModule = backendRequire("@prisma/client");
  PrismaClient = prismaModule.PrismaClient;
} catch (e) {
  console.error("Error: Missing dependencies in apps/backend/node_modules");
  console.error("Run: cd apps/backend && pnpm install");
  console.error(e.message);
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const dbPath = process.argv[2] || join(projectRoot, "scripts", "qa", "qa.db");
  const dbUrl = `file:${resolve(dbPath)}`;

  // Configuración de datos derivados para ALTAS/BAJAS (QA del endpoint reportes)
  const CONFIG = {
    NUM_ALTAS: 20,
    NUM_BAJAS: 10,
    NOVEDADES_ALTA: [
      "ALTA NUEVO INGRESO",
      "ALTA REINGRESO",
      "ALTA MATRIMONIO",
      "ALTA NACIMIENTO",
    ],
    NOVEDADES_BAJA: [
      "BAJA FALLECIMIENTO",
      "BAJA RETIRO VOLUNTARIO",
      "BAJA TRASLADO OTRO CABILDO",
      "BAJA DUPLICADO",
    ],
  };

  // Ensure parent dir exists for the db file
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  console.log(`Database: ${dbPath}`);
  console.log(`DATABASE_URL=${dbUrl}`);

  // 1. Push schema
  console.log("\n[1/4] Running prisma db push...");
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "inherit",
  });
  console.log("  ✓ Tables created");

  // 2. Read seed data
  console.log("\n[2/4] Loading fixtures/seed.json...");
  const seedPath = join(projectRoot, "scripts", "qa", "fixtures", "seed.json");
  const seed = JSON.parse(readFileSync(seedPath, "utf-8"));
  console.log(`  ✓ ${seed.miembros.length} miembros, ${seed.familias.length} familias, ${seed.cabildos.length} cabildos`);

  // 3. Insert data in FK order
  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });

  try {
    console.log("\n[3/4] Seeding data...");

    // Clean existing rows in FK order (idempotent seed — safe to re-run)
    await prisma.miembro.deleteMany();
    await prisma.familia.deleteMany();
    await prisma.cabildo.deleteMany();
    await prisma.usuarioCabildo.deleteMany();
    await prisma.usuario.deleteMany();
    console.log("  ✓ Cleared existing data");

    // Cabildos
    for (const c of seed.cabildos) {
      await prisma.cabildo.create({ data: c });
    }
    console.log(`  ✓ ${seed.cabildos.length} cabildos`);

    // Familias
    for (const f of seed.familias) {
      await prisma.familia.create({
        data: {
          id: f.id,
          numero: f.numero,
          direccion: f.direccion,
          telefono: f.telefono,
          cabildoId: f.cabildoId,
        },
      });
    }
    console.log(`  ✓ ${seed.familias.length} familias`);

    // Miembros (batch para performance)
    // Derivar datos de ALTAS/BAJAS: tomar un subset de los miembros originales
    // y marcarlos con estado/novedad para que las pestañas del censo tengan datos
    // (el QA del endpoint /api/reportes/censo.xlsx valida las 3 pestañas).
    const miembrosConEstado = seed.miembros.map((m, idx) => {
      const data = { ...m };
      if (idx < CONFIG.NUM_ALTAS) {
        data.estado = "PENDIENTE";
        data.novedad = CONFIG.NOVEDADES_ALTA[idx % CONFIG.NOVEDADES_ALTA.length];
      } else if (idx < CONFIG.NUM_ALTAS + CONFIG.NUM_BAJAS) {
        data.estado = "BAJA";
        data.novedad = CONFIG.NOVEDADES_BAJA[(idx - CONFIG.NUM_ALTAS) % CONFIG.NOVEDADES_BAJA.length];
        data.fechaBaja = "2026-07-01T00:00:00.000Z";
      }
      return data;
    });

    const BATCH = 100;
    for (let i = 0; i < miembrosConEstado.length; i += BATCH) {
      const batch = miembrosConEstado.slice(i, i + BATCH);
      await prisma.miembro.createMany({
        data: batch.map((m) => ({
          id: m.id,
          tipoIdentificacion: m.tipoIdentificacion,
          numeroDocumento: m.numeroDocumento,
          nombres: m.nombres,
          apellidos: m.apellidos,
          fechaNacimiento: m.fechaNacimiento,
          parentesco: m.parentesco,
          sexo: m.sexo,
          estadoCivil: m.estadoCivil || null,
          profesion: m.profesion || null,
          escolaridad: m.escolaridad || null,
          integrantes: m.integrantes,
          direccion: m.direccion || null,
          telefono: m.telefono || null,
          cabildoId: m.cabildoId,
          familiaId: m.familiaId,
          // Estado censal: por defecto ACTIVO; altas/bajas derivados arriba
          estado: m.estado || "ACTIVO",
          novedad: m.novedad || null,
          fechaAlta: m.fechaAlta ? new Date(m.fechaAlta) : undefined,
          fechaBaja: m.fechaBaja ? new Date(m.fechaBaja) : undefined,
        })),
      });
      process.stdout.write(`\r  Miembros: ${Math.min(i + BATCH, seed.miembros.length)}/${seed.miembros.length}`);
    }
    console.log("");

    // Usuarios (with hashed passwords)
    for (const u of seed.usuarios) {
      const passwordHash = await bcrypt.hash(u.password, 10);
      const created = await prisma.usuario.create({
        data: {
          id: u.id,
          email: u.email,
          passwordHash,
          nombre: u.nombre,
          rol: u.rol,
          activo: u.activo ?? true,
        },
      });

      // UsuarioCabildo relationship for CAPTAIN users
      if (u.cabildoId) {
        await prisma.usuarioCabildo.create({
          data: {
            usuarioId: created.id,
            cabildoId: u.cabildoId,
            rolEnCabildo: u.rol || "CAPTAIN",
          },
        });
      }
    }
    console.log(`  ✓ ${seed.usuarios.length} usuarios`);

  } finally {
    await prisma.$disconnect();
  }

  // 4. Verify
  console.log("\n[4/4] Verifying...");
  const verifyPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const counts = {
    cabildos: await verifyPrisma.cabildo.count(),
    familias: await verifyPrisma.familia.count(),
    miembros: await verifyPrisma.miembro.count(),
    usuarios: await verifyPrisma.usuario.count(),
    activos: await verifyPrisma.miembro.count({ where: { estado: "ACTIVO" } }),
    pendientes: await verifyPrisma.miembro.count({ where: { estado: "PENDIENTE" } }),
    bajas: await verifyPrisma.miembro.count({ where: { estado: "BAJA" } }),
  };
  await verifyPrisma.$disconnect();
  console.log(`  cabildos: ${counts.cabildos} (expected ${seed.cabildos.length})`);
  console.log(`  familias: ${counts.familias} (expected ${seed.familias.length})`);
  console.log(`  miembros: ${counts.miembros} (expected ${seed.miembros.length})`);
  console.log(`  usuarios: ${counts.usuarios} (expected ${seed.usuarios.length})`);
  console.log(`  estado ACTIVO: ${counts.activos}`);
  console.log(`  estado PENDIENTE (altas): ${counts.pendientes}`);
  console.log(`  estado BAJA (bajas): ${counts.bajas}`);

  const ok =
    counts.cabildos === seed.cabildos.length &&
    counts.familias === seed.familias.length &&
    counts.miembros === seed.miembros.length &&
    counts.usuarios === seed.usuarios.length &&
    counts.pendientes === CONFIG.NUM_ALTAS &&
    counts.bajas === CONFIG.NUM_BAJAS;

  console.log(`\n${ok ? "✓ SEED OK" : "✗ SEED MISMATCH"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("\nSeed failed:", e.message);
  process.exit(1);
});
