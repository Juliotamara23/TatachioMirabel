import { Request, Response, NextFunction } from "express";
import { spawn } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma } from "@prisma/client";
import prisma from "../database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// apps/backend/src/controllers -> raíz del repo
const FORMATEADOR_PATH = path.resolve(
  __dirname,
  "../../../../scripts/excel-formateador/formateador.py",
);

const INCLUDE_CABILDO_FAMILIA = { cabildo: true, familia: true } as const;

type MiembroConRelaciones = Prisma.MiembroGetPayload<{
  include: { cabildo: true; familia: true };
}>;

type FilaReporte = Record<string, string | number>;

/** Fila de la pestaña FORMATO_CENSOS (18 columnas del template ministerial) */
function mapearCenso(m: MiembroConRelaciones): FilaReporte {
  return {
    // La columna del template es literalmente "1. VIGENCIA"
    "1. VIGENCIA": m.cabildo.vigencia,
    "RESGUARDO INDIGENA": m.cabildo.resguardo,
    "COMUNIDAD INDIGENA": m.cabildo.comunidad,
    FAMILIA: m.familia.numero,
    "TIPO IDENTIFICACION": m.tipoIdentificacion,
    "NUMERO DOCUMENTO": m.numeroDocumento,
    NOMBRES: m.nombres,
    APELLIDOS: m.apellidos,
    "FECHA NACIMIENTO": m.fechaNacimiento,
    PARENTESCO: m.parentesco,
    SEXO: m.sexo,
    "ESTADO CIVIL": m.estadoCivil ?? "",
    PROFESION: m.profesion ?? "",
    ESCOLARIDAD: m.escolaridad ?? "",
    INTEGRANTES: m.integrantes,
    DIRECCION: m.direccion ?? "",
    TELEFONO: m.telefono ?? "",
    USUARIO: "SISTEMA",
  };
}

/** Fila de REPORTE ALTAS / REPORTE BAJAS (15 columnas del template) */
function mapearAltasBajas(m: MiembroConRelaciones, novedadPorDefecto: string): FilaReporte {
  return {
    VIGENCIA: m.cabildo.vigencia,
    "RESGUARDO INDIGENA": m.cabildo.resguardo,
    "COMUNIDAD INDIGENA": m.cabildo.comunidad,
    FAMILIA: m.familia.numero,
    IDENTIFICACION: m.tipoIdentificacion,
    "NUMERO DOCUMENTO": m.numeroDocumento,
    NOMBRES: m.nombres,
    APELLIDOS: m.apellidos,
    "FECHA NACIMIENTO": m.fechaNacimiento,
    PARENTESCO: m.parentesco,
    SEXO: m.sexo,
    ESTADOCIVIL: m.estadoCivil ?? "",
    PROFESION: m.profesion ?? "",
    ESCOLARIDAD: m.escolaridad ?? "",
    NOVEDAD: m.novedad ?? novedadPorDefecto,
  };
}

function limpiarTemporales(paths: string[]): void {
  for (const p of paths) {
    try {
      if (existsSync(p)) {
        unlinkSync(p);
      }
    } catch {
      // El cleanup nunca debe romper la respuesta
    }
  }
}

/**
 * Ejecuta formateador.py con spawn (no execFile) y resuelve cuando termina.
 * Captura stdout/stderr para diagnóstico.
 */
function ejecutarFormateador(formateadorPath: string, tmpJson: string, tmpXlsx: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [formateadorPath, "--data", tmpJson, "--output", tmpXlsx]);

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(new Error(`No se pudo ejecutar el formateador: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        console.error("[reportes] formateador stdout:", stdout);
        console.error("[reportes] formateador stderr:", stderr);
        reject(new Error(`formateador.py falló con código ${code}: ${stderr}`));
      }
    });
  });
}

export async function generarCenso(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const timestamp = Date.now();
  const tmpJson = path.join(os.tmpdir(), `reporte-${timestamp}.json`);
  const tmpXlsx = path.join(os.tmpdir(), `reporte-${timestamp}.xlsx`);

  try {
    const [censo, altas, bajas] = await Promise.all([
      prisma.miembro.findMany({
        where: { estado: "ACTIVO" },
        include: INCLUDE_CABILDO_FAMILIA,
      }),
      prisma.miembro.findMany({
        where: {
          OR: [{ novedad: { not: null } }, { estado: { not: "ACTIVO" } }],
        },
        include: INCLUDE_CABILDO_FAMILIA,
      }),
      prisma.miembro.findMany({
        where: {
          OR: [{ fechaBaja: { not: null } }, { estado: "BAJA" }],
        },
        include: INCLUDE_CABILDO_FAMILIA,
      }),
    ]);

    const data = {
      censo: censo.map((m) => mapearCenso(m)),
      altas: altas.map((m) => mapearAltasBajas(m, "ALTA NUEVA")),
      bajas: bajas.map((m) => mapearAltasBajas(m, "BAJA VOLUNTARIA")),
    };

    writeFileSync(tmpJson, JSON.stringify(data), "utf-8");

    await ejecutarFormateador(FORMATEADOR_PATH, tmpJson, tmpXlsx);

    res.download(tmpXlsx, `censo-${new Date().getFullYear()}.xlsx`, (err) => {
      limpiarTemporales([tmpJson, tmpXlsx]);
      if (err) {
        next(err);
      }
    });
  } catch (error) {
    limpiarTemporales([tmpJson, tmpXlsx]);
    next(error);
  }
}
