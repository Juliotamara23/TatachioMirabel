import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();

const cabildos = [
  { nombre: "Tatachio Mirabel", resguardo: "Resguardo Tatachio", comunidad: "Comunidad Tatachio", vigencia: 2026 },
  { nombre: "San Juan", resguardo: "Resguardo San Juan", comunidad: "Comunidad San Juan", vigencia: 2026 },
  { nombre: "La Esperanza", resguardo: "Resguardo La Esperanza", comunidad: "Comunidad Esperanza", vigencia: 2026 },
];

const familias = [
  { numero: 1, direccion: "Calle 1 #1-01", cabildoIndex: 0 },
  { numero: 2, direccion: "Calle 1 #1-02", cabildoIndex: 0 },
  { numero: 3, direccion: "Calle 1 #1-03", cabildoIndex: 0 },
  { numero: 4, direccion: "Calle 2 #2-01", cabildoIndex: 0 },
  { numero: 5, direccion: "Calle 3 #3-01", cabildoIndex: 1 },
  { numero: 6, direccion: "Calle 3 #3-02", cabildoIndex: 1 },
  { numero: 7, direccion: "Calle 3 #3-03", cabildoIndex: 1 },
  { numero: 8, direccion: "Calle 4 #4-01", cabildoIndex: 1 },
  { numero: 9, direccion: "Calle 5 #5-01", cabildoIndex: 2 },
  { numero: 10, direccion: "Calle 5 #5-02", cabildoIndex: 2 },
];

const nombresMasculinos = ["JUAN", "CARLOS", "ANDRES", "PEDRO", "LUIS", "JOSE", "MIGUEL", "DIEGO", "JORGE", "FELIPE", "MATEO", "SANTIAGO", "SEBASTIAN", "ALEJANDRO", "DANIEL"];
const nombresFemeninos = ["MARIA", "ANA", "LAURA", "CARMEN", "ISABEL", "SOFIA", "VALENTINA", "CAMILA", "NATALIA", "DIANA", "LUISA", "PAULA", "ANDREA", "CLAUDIA", "ROSA"];
const apellidos = ["PEREZ", "GONZALEZ", "RODRIGUEZ", "LOPEZ", "MARTINEZ", "HERNANDEZ", "GARCIA", "RAMIREZ", "TORRES", "FLORES", "RIVERA", "MORALES", "ORTIZ", "CRUZ", "RUIZ"];

const parentescos = ["PA", "MA", "CO", "HE", "CF", "ES", "HI", "YR", "NU", "SU", "SO", "CU", "TI", "AB", "NI"] as const;

function padIndex(n: number): string {
  return n.toString().padStart(8, "0");
}

export async function main() {
  console.log("Limpiando base de datos...");
  
  // Delete in correct order to respect FK constraints
  await prisma.miembro.deleteMany();
  await prisma.familia.deleteMany();
  await prisma.cabildo.deleteMany();

  console.log("Creando cabildos...");
  const createdCabildos = [];
  for (const c of cabildos) {
    const created = await prisma.cabildo.create({ data: c });
    createdCabildos.push(created);
  }

  console.log("Creando familias...");
  const createdFamilias = [];
  for (const f of familias) {
    const created = await prisma.familia.create({
      data: {
        numero: f.numero,
        direccion: f.direccion,
        cabildoId: createdCabildos[f.cabildoIndex].id,
      },
    });
    createdFamilias.push(created);
  }

  console.log("Creando miembros...");
  let miembroIndex = 0;
  for (let i = 0; i < 30; i++) {
    const familia = createdFamilias[i % createdFamilias.length];
    const cabildo = createdCabildos.find((c) => c.id === familia.cabildoId)!;
    const esFemenino = i % 2 === 0;
    const nombre = esFemenino
      ? nombresFemeninos[i % nombresFemeninos.length]
      : nombresMasculinos[i % nombresMasculinos.length];
    const apellido = apellidos[i % apellidos.length];
    const fechaNacimiento = `${(i % 28 + 1).toString().padStart(2, "0")}/${((i % 12) + 1).toString().padStart(2, "0")}/${1980 + (i % 45)}`;

    await prisma.miembro.create({
      data: {
        tipoIdentificacion: i % 4 === 0 ? "TI" : "CC",
        numeroDocumento: padIndex(miembroIndex + 10000000),
        nombres: nombre,
        apellidos: apellido,
        fechaNacimiento,
        parentesco: parentescos[i % parentescos.length],
        sexo: esFemenino ? "F" : "M",
        integrantes: (i % 5) + 1,
        cabildoId: cabildo.id,
        familiaId: familia.id,
      },
    });
    miembroIndex++;
  }

  console.log("Seed completado:");
  console.log(`  - ${createdCabildos.length} cabildos`);
  console.log(`  - ${createdFamilias.length} familias`);
  console.log(`  - ${miembroIndex} miembros`);

  await prisma.$disconnect();
}

// Only run when executed directly (not imported by tests)
const isDirectRun = process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js");
if (isDirectRun) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
