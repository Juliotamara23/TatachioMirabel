import { readFileSync } from "fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: number;
}

interface ColumnMapping {
  tipoIdentificacion: string;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  fechaNacimiento: string;
  parentesco: string;
  sexo: string;
  integrantes?: string;
  cabildoId?: string;
  familiaId?: string;
}

/**
 * Lee la configuración de mapeo de columnas desde variables de entorno.
 * Formato: EXCEL_MAP_NOMBRES=nombres, EXCEL_MAP_APELLIDOS=apellidos, etc.
 */
function getColumnMapping(): ColumnMapping {
  return {
    tipoIdentificacion: process.env.EXCEL_MAP_TIPO_ID || "tipoIdentificacion",
    numeroDocumento: process.env.EXCEL_MAP_DOCUMENTO || "numeroDocumento",
    nombres: process.env.EXCEL_MAP_NOMBRES || "nombres",
    apellidos: process.env.EXCEL_MAP_APELLIDOS || "apellidos",
    fechaNacimiento: process.env.EXCEL_MAP_FECHA_NAC || "fechaNacimiento",
    parentesco: process.env.EXCEL_MAP_PARENTESCO || "parentesco",
    sexo: process.env.EXCEL_MAP_SEXO || "sexo",
    integrantes: process.env.EXCEL_MAP_INTEGRANTES || "integrantes",
    cabildoId: process.env.EXCEL_MAP_CABILDO_ID || "cabildoId",
    familiaId: process.env.EXCEL_MAP_FAMILIA_ID || "familiaId",
  };
}

/**
 * Valida que una fila tenga los campos requeridos para un miembro.
 */
function isValidMemberRow(row: Record<string, any>, mapping: ColumnMapping): boolean {
  const required = [
    mapping.tipoIdentificacion,
    mapping.numeroDocumento,
    mapping.nombres,
    mapping.apellidos,
    mapping.fechaNacimiento,
    mapping.parentesco,
    mapping.sexo,
  ];

  for (const key of required) {
    if (!row[key] || String(row[key]).trim() === "") {
      return false;
    }
  }
  return true;
}

export async function importExcel(filePath: string): Promise<ImportResult> {
  let buffer: Buffer;

  try {
    buffer = readFileSync(filePath);
  } catch {
    throw new Error(`Archivo no encontrado: ${filePath}`);
  }

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return { total: 0, imported: 0, skipped: 0, errors: 0 };
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

  if (rows.length === 0) {
    return { total: 0, imported: 0, skipped: 0, errors: 0 };
  }

  const mapping = getColumnMapping();
  const result: ImportResult = { total: rows.length, imported: 0, skipped: 0, errors: 0 };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (!isValidMemberRow(row, mapping)) {
      console.warn(`[Fila ${i + 1}] Fila inválida — campos requeridos faltantes, saltando`);
      result.skipped++;
      continue;
    }

    try {
      const miembroData: Record<string, any> = {
        tipoIdentificacion: String(row[mapping.tipoIdentificacion]).trim(),
        numeroDocumento: String(row[mapping.numeroDocumento]).trim(),
        nombres: String(row[mapping.nombres]).trim().toUpperCase(),
        apellidos: String(row[mapping.apellidos]).trim().toUpperCase(),
        fechaNacimiento: String(row[mapping.fechaNacimiento]).trim(),
        parentesco: String(row[mapping.parentesco]).trim(),
        sexo: String(row[mapping.sexo]).trim(),
        integrantes: mapping.integrantes && row[mapping.integrantes]
          ? Number(row[mapping.integrantes]) || 1
          : 1,
      };

      // Optional fields
      if (mapping.cabildoId && row[mapping.cabildoId]) {
        miembroData.cabildoId = String(row[mapping.cabildoId]).trim();
      }
      if (mapping.familiaId && row[mapping.familiaId]) {
        miembroData.familiaId = String(row[mapping.familiaId]).trim();
      }

      // Require cabildoId and familiaId
      if (!miembroData.cabildoId || !miembroData.familiaId) {
        console.warn(`[Fila ${i + 1}] Faltan cabildoId o familiaId, saltando`);
        result.skipped++;
        continue;
      }

      await prisma.miembro.create({ data: miembroData });
      result.imported++;
    } catch (err: any) {
      console.error(`[Fila ${i + 1}] Error al importar: ${err.message}`);
      result.errors++;
    }
  }

  console.log(`\nResumen de importación:`);
  console.log(`  Total filas: ${result.total}`);
  console.log(`  Importadas: ${result.imported}`);
  console.log(`  Saltadas: ${result.skipped}`);
  console.log(`  Errores: ${result.errors}`);

  return result;
}

// CLI entry point
if (process.argv[1]?.endsWith("import-excel.ts") || process.argv[1]?.endsWith("import-excel.js")) {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error("Uso: tsx scripts/import-excel.ts <ruta/archivo.xlsx>");
    process.exit(1);
  }

  importExcel(filePath)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error(err.message);
      prisma.$disconnect().then(() => process.exit(1));
    });
}
