import { Request, Response, NextFunction } from "express";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma } from "@prisma/client";
import { resolveReportesDir } from "@tatachio/shared/node";
import prisma from "../database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// apps/backend/src/controllers -> repo root
const FORMATEADOR_PATH = path.resolve(
  __dirname,
  "../../../../scripts/excel-formateador/formateador.py",
);

const INCLUDE_CABILDO_FAMILIA = { cabildo: true, familia: true } as const;

type MiembroConRelaciones = Prisma.MiembroGetPayload<{
  include: { cabildo: true; familia: true };
}>;

type FilaReporte = Record<string, string | number>;

/**
 * Sanitizes a cabildo name for use in a download filename:
 * lowercase, accents stripped (NFD), whitespace runs → "-", anything that is
 * not a letter/digit/dash removed, and leading/trailing dashes trimmed (XLSX-2).
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

/** FORMATO_CENSOS sheet row (18 ministerial template columns) */
function mapearCenso(m: MiembroConRelaciones): FilaReporte {
  return {
    // The template column is literally "1. VIGENCIA"
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

/** REPORTE ALTAS / REPORTE BAJAS row (15 template columns) */
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
      // Cleanup must never break the response
    }
  }
}

/**
 * Runs formateador.py via spawn (not execFile) and resolves when it finishes.
 * Captures stdout/stderr for diagnostics.
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
  // The intermediate JSON is ephemeral → stays in os.tmpdir(); the final xlsx lives
  // in the shared TATACHIO_REPORTES_DIR (~/.tatachio/reportes), created at
  // runtime; successful reports persist (decision 2026-08-14, #60).
  const tmpJson = path.join(os.tmpdir(), `reporte-${unique}.json`);
  // resolveReportesDir() may throw on a misconfigured TATACHIO_REPORTES_DIR
  // (empty / whitespace / relative path — issue #66). Keep the call inside
  // the try so the throw becomes a 500 via next(error) instead of crashing
  // the request.
  let reportesDir: string;
  let xlsxPath = "";
  let xlsxPreexistia = false;

  try {
    // XLSX-1: optional ?cabildoId= scopes the report to a single cabildo.
    // Only string values are honored (Express may deliver arrays/objects).
    const cabildoId = typeof req.query?.cabildoId === "string" ? req.query.cabildoId : undefined;

    let cabildoFilter: Prisma.MiembroWhereInput = {};
    let nombreXlsx = `censo-${new Date().getFullYear()}.xlsx`;

    if (cabildoId) {
      const cabildo = await prisma.cabildo.findUnique({ where: { id: cabildoId } });
      if (!cabildo) {
        res.status(404).json({ error: "Cabildo no encontrado" });
        return;
      }
      cabildoFilter = { cabildoId };
      nombreXlsx = `censo-${slugify(cabildo.nombre)}-${new Date().getFullYear()}.xlsx`;
    }

    reportesDir = resolveReportesDir();
    mkdirSync(reportesDir, { recursive: true });
    xlsxPath = path.join(reportesDir, nombreXlsx);
    // If the report already exists (a previous generation this year), a failure
    // of THIS request must not delete it: only the xlsx this request created is
    // cleaned up (fix R4-001 — the path is shared across requests).
    xlsxPreexistia = existsSync(xlsxPath);

    const [censo, altas, bajas] = await Promise.all([
      prisma.miembro.findMany({
        where: { estado: "ACTIVO", ...cabildoFilter },
        include: INCLUDE_CABILDO_FAMILIA,
      }),
      prisma.miembro.findMany({
        where: { estado: "PENDIENTE", ...cabildoFilter },
        include: INCLUDE_CABILDO_FAMILIA,
      }),
      prisma.miembro.findMany({
        where: { estado: "BAJA", ...cabildoFilter },
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
      // Success: the report PERSISTS in the shared dir; only the tmpdir JSON is cleaned.
      limpiarTemporales([tmpJson]);
      if (err) {
        next(err);
      }
    });
  } catch (error) {
    // On failure: the temp JSON is always cleaned; the shared xlsx ONLY if
    // this request created it (a previously valid report is preserved).
    // xlsxPath may be empty if resolveReportesDir() threw before it was set
    // (issue #66) — limpiarTemporales already guards against missing files,
    // but skip the call entirely when no path was computed yet.
    limpiarTemporales([tmpJson]);
    if (xlsxPath && !xlsxPreexistia) {
      limpiarTemporales([xlsxPath]);
    }
    next(error);
  }
}
