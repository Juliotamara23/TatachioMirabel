import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");
const backendDir = join(projectRoot, "apps", "backend");
const backendRequire = createRequire(join(backendDir, "package.json"));

const { PrismaClient } = backendRequire("@prisma/client");

const dbPath = join(projectRoot, "scripts", "qa", "qa.db");
const dbUrl = `file:${resolve(dbPath)}`;

console.log("Testing basic Prisma connection...");
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function test() {
  try {
    await prisma.$connect();
    console.log("Connected OK");
    const count = await prisma.cabildo.count();
    console.log("Cabildo count:", count);
    await prisma.$disconnect();
    console.log("Disconnected OK");
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
}
test();
