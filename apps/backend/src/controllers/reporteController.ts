import { Request, Response, NextFunction } from "express";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma } from "@prisma/client";
import { resolveReportesDir } from "@tatachio/shared";
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
const FORMATEADOR_TIMEOUT_MS = 60_000;

function ejecutarFormateador(formateadorPath: string, tmpJson: string, tmpXlsx: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [formateadorPath, "--data", tmpJson, "--output", tmpXlsx]);

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`formateador.py no respondió en ${FORMATEADOR_TIMEOUT_MS / 1000}s`));
    }, FORMATEADOR_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`No se pudo ejecutar el formateador: ${err.message}`));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
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
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  // El JSON intermedio es efímero → sigue en os.tmpdir(); el xlsx final vive en
  // la carpeta compartida TATACHIO_REPORTES_DIR (~/.tatachio/reportes), que se
  // crea en runtime y persiste el reporte exitoso (decisión 2026-08-14, #60).
  const tmpJson = path.join(os.tmpdir(), `reporte-${unique}.json`);
  const reportesDir = resolveReportesDir();
  mkdirSync(reportesDir, { recursive: true });
  const nombreXlsx = `censo-${new Date().getFullYear()}.xlsx`;
  const xlsxPath = path.join(reportesDir, nombreXlsx);
  // Si el reporte ya existía (generación previa del mismo año), un fallo de
  // ESTA request no debe borrarlo: se limpia solo el xlsx que esta request
  // llegó a crear (fix R4-001 — el path es compartido entre requests).
  const xlsxPreexistia = existsSync(xlsxPath);

  try {
    const [censo, altas, bajas] = await Promise.all([
      prisma.miembro.findMany({
        where: { estado: "ACTIVO" },
        include: INCLUDE_CABILDO_FAMILIA,
      }),
      prisma.miembro.findMany({
        where: { estado: "PENDIENTE" },
        include: INCLUDE_CABILDO_FAMILIA,
      }),
      prisma.miembro.findMany({
        where: { estado: "BAJA" },
        include: INCLUDE_CABILDO_FAMILIA,
      }),
    ]);

    const data = {
      censo: censo.map((m) => mapearCenso(m)),
      altas: altas.map((m) => mapearAltasBajas(m, "ALTA NUEVA")),
      bajas: bajas.map((m) => mapearAltasBajas(m, "BAJA VOLUNTARIA")),
    };

    writeFileSync(tmpJson, JSON.stringify(data), "utf-8");

    await ejecutarFormateador(FORMATEADOR_PATH, tmpJson, xlsxPath);

    res.download(xlsxPath, nombreXlsx, (err) => {
      // Éxito: el reporte PERSISTE en la carpeta compartida; solo se limpia el
      // JSON intermedio del tmpdir.
      limpiarTemporales([tmpJson]);
      if (err) {
        next(err);
      }
    });
  } catch (error) {
    // Falla: se limpia el JSON temporal siempre; el xlsx compartido SOLO si
    // esta request lo creó (si preexistía un reporte válido, se preserva).
    limpiarTemporales([tmpJson]);
    if (!xlsxPreexistia) {
      limpiarTemporales([xlsxPath]);
    }
    next(error);
  }
}
