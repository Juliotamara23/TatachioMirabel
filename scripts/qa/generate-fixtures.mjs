/**
 * Generates fixtures/seed.json with ~1000 realistic community members.
 *
 * Run once: node scripts/qa/generate-fixtures.mjs
 * Output:   scripts/qa/fixtures/seed.json (committed, deterministic)
 *
 * Real data patterns extracted from the Tatachio Mirabel census Excel.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

// Seeded PRNG for deterministic output across runs
// Using a simple mulberry32 PRNG so the same seed always produces the same data
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(2026); // Fijo para reproducibilidad

// ── Real community data ──────────────────────────────────────────────

const APELLIDOS = [
  "BENITEZ", "CONTRERAS", "ALVAREZ", "MARTINEZ", "ESPEJO", "HOYOS",
  "PADILLA", "MARENCO", "RIOS", "AGUILERA", "BARRETO", "LUQUE",
  "GAVIRIA", "PINEDA", "DIAZ", "MORALES", "VILLAMISAR", "TATACHIO",
  "CAMPO", "PASCUE", "CALAMBAS", "TUNUBALA", "YALANDA",
];

const NOMBRES_M = [
  "EDUARDO", "ANTONIO", "EDILBERTO", "JAVIER", "JESUS", "ALBERTO",
  "HARRINSON", "GUILLERMO", "DAVID", "CARLOS", "ANDRES", "PEDRO",
  "LUIS", "JOSE", "MIGUEL", "DIEGO", "JORGE", "FELIPE", "MATEO",
  "SANTIAGO", "SEBASTIAN", "ALEJANDRO", "DANIEL", "OSCAR", "FERNANDO",
  "RICARDO", "GABRIEL", "RAFAEL", "EMILIANO", "LEONARDO", "DARIO",
  "WILSON", "JHON", "BRAYAN", "YEISON", "FABIAN",
];

const NOMBRES_F = [
  "ANGELICA", "PATRICIA", "FANNY", "ISABEL", "DANNA", "MARCELA",
  "VANESSA", "ALEJANDRA", "AMANDA", "LAURA", "CRISTINA", "KAREN",
  "DANIELA", "TRAICY", "MARIA", "ANA", "CARMEN", "SOFIA", "VALENTINA",
  "CAMILA", "NATALIA", "DIANA", "LUISA", "PAULA", "ANDREA", "CLAUDIA",
  "ROSA", "ELENA", "JULIANA", "LINA", "YULI", "LEIDY", "SANDRA",
  "MERCEDES", "GLORIA", "DORIS",
];

const SEGUNDOS_NOMBRES = [
  "ANTONIO", "PATRICIA", "ISABEL", "ALBERTO", "MARCELA", "ALEJANDRA",
  "GUILLERMO", "DE JESUS", "CRISTINA", "DEL CARMEN", "FERNANDA",
  "ESTEBAN", "VALENTINA", "SEBASTIAN", "LUCIA", "JAVIER",
];

const PROFESIONES = [
  "COMERCIANTE", "AMA DE CASA", "ESTUDIANTE", "AGRICULTOR", "ARTESANO",
  "DOCENTE", "LIDER COMUNITARIO", "ENFERMERA", "CONDUCTOR", "JORNALERO",
  "PESCADOR", "MODISTA", "PELUQUERA", "GASTRONOMIA", "CONTADURIA",
  "PSICOLOGA", "VIGILANTE", "ALBAÑIL", "MOTOTAXISTA", "COCINERA",
];

const ESCOLARIDADES = ["PR", "SE", "UN", "NI"];
const TIPOS_ID = ["CC", "CC", "CC", "TI", "RC"]; // CC mas comun
const VEREDAS = [
  "VDA MIRABEL", "VDA EL CARMEN", "VDA SAN JUAN",
  "VDA LA ESPERANZA", "VDA EL PARAISO", "VDA BELLAVISTA",
];

const CABILDOS = [
  { nombre: "TATACHIO MIRABEL", resguardo: "RESGUARDO TATACHIO", comunidad: "COMUNIDAD TATACHIO", vigencia: 2026 },
  { nombre: "SAN JUAN", resguardo: "RESGUARDO SAN JUAN", comunidad: "COMUNIDAD SAN JUAN", vigencia: 2026 },
  { nombre: "LA ESPERANZA", resguardo: "RESGUARDO LA ESPERANZA", comunidad: "COMUNIDAD LA ESPERANZA", vigencia: 2026 },
];

// ── Parentesco by age range per role ──────────────────────────────────

const PARENTESCO_AGE = {
  CF: [25, 65], PA: [25, 65], MA: [22, 60], ES: [22, 60], CO: [22, 60],
  HI: [0, 30],  HE: [10, 55],  SO: [0, 25], NI: [0, 15],
  YR: [18, 40], NU: [18, 40], CU: [15, 50], TI: [35, 70],
  AB: [55, 90], SU: [50, 80],
};

// CF is "Cabeza de Familia" — treated same as PA/MA structurally
// Family head roles: CF most common (head of household), PA father, MA mother (single-mother)
const HEAD_ROLES = ["CF", "CF", "CF", "PA", "MA"]; // CF most common
const CHILD_ROLES = ["HI", "HI", "HI", "HI", "SO", "NI"]; // HI most common
const OTHER_ROLES = ["HE", "YR", "NU", "SU", "SO", "CU", "TI", "AB"];

// ── Helpers ───────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function pickWeighted(arr, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

function generarNombre(sexo) {
  const pool = sexo === "M" ? NOMBRES_M : NOMBRES_F;
  return `${pick(pool)} ${pick(SEGUNDOS_NOMBRES)}`;
}

function generarApellido() {
  return pick(APELLIDOS);
}

function generarApellidos() {
  const a1 = generarApellido();
  const a2 = pick(APELLIDOS);
  return a1 === a2 ? a1 : `${a1} ${a2}`;
}

function generarFechaNacimiento(edad) {
  const year = 2026 - edad;
  const month = String(Math.floor(rand() * 12) + 1).padStart(2, "0");
  const day = String(Math.floor(rand() * 28) + 1).padStart(2, "0");
  return `${day}/${month}/${year}`;
}

function edadFromParentesco(parentesco) {
  const [min, max] = PARENTESCO_AGE[parentesco] || [18, 60];
  return Math.floor(min + rand() * (max - min));
}

function docNumber() {
  return String(10000000 + Math.floor(rand() * 90000000));
}

function intBetween(min, max) {
  return Math.floor(min + rand() * (max - min + 1));
}

// ── Family generation ─────────────────────────────────────────────────

/**
 * Generates one family: 2–8 members with realistic parentesco distribution.
 * Returns { familia: {...}, miembros: [...] }
 */
function generarFamilia(numero, cabildoId, apellidoBase) {
  const miembros = [];
  const tamano = intBetween(2, 8);
  const vereda = pick(VEREDAS);
  const direccion = `${vereda} CASA ${numero}`;
  const telefono = rand() < 0.4 ? `31${String(Math.floor(rand() * 9000000) + 1000000)}` : null;

  const familia = {
    id: randomUUID(),
    numero,
    direccion,
    telefono,
    cabildoId,
  };

  // First member: family head (CF, PA, or MA)
  // The head defines the family apellido that children inherit
  const headRole = pick(HEAD_ROLES);
  const headSexo = headRole === "MA" ? "F" : pick(["M", "F"]);
  const headEdad = edadFromParentesco(headRole);
  const familyApellido = apellidoBase || generarApellidos(); // Family last name

  miembros.push({
    id: randomUUID(),
    tipoIdentificacion: "CC",
    numeroDocumento: docNumber(),
    nombres: generarNombre(headSexo),
    apellidos: headRole === "MA" ? generarApellidos() : familyApellido,
    fechaNacimiento: generarFechaNacimiento(headEdad),
    parentesco: headRole,
    sexo: headSexo,
    estadoCivil: headEdad > 18 ? pick(["S", "C"]) : "S",
    profesion: headEdad > 16 ? pick(PROFESIONES) : "ESTUDIANTE",
    escolaridad: headEdad > 18 ? pick(ESCOLARIDADES) : pick(["PR", "SE", "NI"]),
    integrantes: 1,
    direccion: direccion,
    telefono: telefono,
    cabildoId,
    familiaId: familia.id,
  });

  // If head is CF, maybe add PA or MA as spouse
  let remaining = tamano - 1;
  if (headRole === "CF" && remaining > 0 && rand() < 0.7) {
    const spouseSexo = headSexo === "M" ? "F" : "M";
    const spouseRole = pick(["ES", "CO"]);
    const spouseEdad = Math.max(18, headEdad + intBetween(-5, 5));
    const spouseApellido = generarApellidos();
    miembros.push({
      id: randomUUID(),
      tipoIdentificacion: pick(TIPOS_ID),
      numeroDocumento: docNumber(),
      nombres: generarNombre(spouseSexo),
      apellidos: spouseApellido,
      fechaNacimiento: generarFechaNacimiento(spouseEdad),
      parentesco: spouseRole,
      sexo: spouseSexo,
      estadoCivil: spouseEdad > 18 ? pick(["S", "C"]) : "S",
      profesion: pick(PROFESIONES),
      escolaridad: pick(ESCOLARIDADES),
      integrantes: 2,
      direccion: direccion,
      telefono: telefono,
      cabildoId,
      familiaId: familia.id,
    });
    remaining--;
  }

  // Children and other relatives
  let integranteIdx = miembros.length;
  for (let i = 0; i < remaining; i++) {
    const role = pick(CHILD_ROLES);
    const edad = edadFromParentesco(role);
    const sexo = pick(["M", "F"]);
    // Children inherit the family apellido. Other relatives may have different ones.
    const apellido = role === "HI" ? familyApellido : generarApellidos();

    miembros.push({
      id: randomUUID(),
      tipoIdentificacion: pick(edad < 18 ? ["TI", "RC"] : TIPOS_ID),
      numeroDocumento: docNumber(),
      nombres: generarNombre(sexo),
      apellidos: apellido,
      fechaNacimiento: generarFechaNacimiento(edad),
      parentesco: role,
      sexo,
      estadoCivil: edad >= 18 ? pick(["S", "C"]) : "S",
      profesion: edad < 16 ? "ESTUDIANTE" : pick(PROFESIONES),
      escolaridad: edad < 6 ? "NI" : edad < 18 ? pick(["PR", "SE"]) : pick(ESCOLARIDADES),
      integrantes: ++integranteIdx,
      direccion: direccion,
      telefono: telefono,
      cabildoId,
      familiaId: familia.id,
    });
  }

  return { familia, miembros };
}

// ── Altas/Bajas generation ────────────────────────────────────────────

function generarAltas(count, cabildos) {
  const altas = [];
  for (let i = 0; i < count; i++) {
    const cabildo = pick(cabildos);
    const sexo = pick(["M", "F"]);
    const edad = intBetween(0, 60);
    altas.push({
      vigencia: cabildo.vigencia,
      comunidadIndigena: cabildo.comunidad,
      familia: intBetween(1, 300),
      tipoIdentificacion: pick(edad < 7 ? ["RC"] : edad < 18 ? ["TI", "RC"] : ["CC"]),
      numeroDocumento: docNumber(),
      nombres: generarNombre(sexo),
      apellidos: generarApellidos(),
      fechaNacimiento: generarFechaNacimiento(edad),
      parentesco: edad < 18 ? pick(["HI", "SO", "NI"]) : pick(["CF", "PA", "MA", "ES", "CO", "HE"]),
      sexo,
      estadoCivil: edad >= 18 ? pick(["S", "C"]) : "S",
      profesion: edad < 16 ? "ESTUDIANTE" : pick(PROFESIONES),
      escolaridad: edad < 6 ? "NI" : edad < 18 ? pick(["PR", "SE"]) : pick(ESCOLARIDADES),
      novedad: "",
    });
  }
  return altas;
}

// ── Main ───────────────────────────────────────────────────────────────

function main() {
  console.log("Generando fixtures realistas Tatachio Mirabel...\n");

  // 1. Cabildos (fixed)
  const cabildos = CABILDOS.map((c) => ({ ...c, id: randomUUID() }));

  // 2. Familias + miembros (~250 familias, ~1000 miembros)
  const todasFamilias = [];
  const todosMiembros = [];
  let familiaNumero = 1;

  // Distribute families across cabildos (weighted: ~50% Tatachio, ~30% San Juan, ~20% La Esperanza)
  const cabildoWeights = [5, 3, 2];
  const targetMiembros = 1000;

  while (todosMiembros.length < targetMiembros) {
    const cabildo = pickWeighted(cabildos, cabildoWeights);
    const apellidoBase = pick(APELLIDOS);
    const { familia, miembros } = generarFamilia(familiaNumero++, cabildo.id, apellidoBase);
    todasFamilias.push(familia);
    todosMiembros.push(...miembros);
  }

  // Trim to ~1000
  const miembros = todosMiembros.slice(0, targetMiembros);
  // Keep only families that still have members
  const familiaIds = new Set(miembros.map((m) => m.familiaId));
  const familias = todasFamilias.filter((f) => familiaIds.has(f.id));

  // 3. Usuarios
  const usuarios = [
    {
      id: randomUUID(),
      email: "admin@tatachio.com",
      password: "admin123",
      nombre: "ADMINISTRADOR",
      rol: "ADMINISTRATOR",
      activo: true,
    },
    {
      id: randomUUID(),
      email: "capitana@tatachio.com",
      password: "cap123",
      nombre: "CAPITANA TATACHIO",
      rol: "CAPTAIN",
      activo: true,
      cabildoId: cabildos[0].id,
    },
    {
      id: randomUUID(),
      email: "capitana2@tatachio.com",
      password: "cap123",
      nombre: "CAPITANA SAN JUAN",
      rol: "CAPTAIN",
      activo: true,
      cabildoId: cabildos[1].id,
    },
  ];

  // 4. Altas (50 sample records for report testing)
  const altas = generarAltas(50, cabildos);

  // 5. Assemble
  const seed = {
    _meta: {
      generado: new Date().toISOString(),
      seed: 2026,
      totalMiembros: miembros.length,
      totalFamilias: familias.length,
      totalCabildos: cabildos.length,
      totalUsuarios: usuarios.length,
      totalAltas: altas.length,
    },
    cabildos,
    familias,
    miembros,
    usuarios,
    altas,
  };

  // 6. Write
  const outputDir = new URL("./fixtures", import.meta.url).pathname;
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  const outputPath = `${outputDir}/seed.json`;
  writeFileSync(outputPath, JSON.stringify(seed, null, 2), "utf-8");

  console.log(`Cabildos:  ${cabildos.length}`);
  console.log(`Familias:  ${familias.length}`);
  console.log(`Miembros:  ${miembros.length}`);
  console.log(`Usuarios:  ${usuarios.length}`);
  console.log(`Altas:     ${altas.length}`);
  console.log(`\nEscrito:   ${outputPath}`);
}

main();
