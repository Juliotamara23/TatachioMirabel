import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Mock Prisma before importing the controller
vi.mock("../../src/database.js", () => ({
  default: {
    miembro: {
      findMany: vi.fn(),
    },
  },
}));

// Mock child_process.spawn before importing the controller
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

import prisma from "../../src/database.js";
import { generarCenso } from "../../src/controllers/reporteController.js";

function makeMiembro(overrides: Record<string, unknown> = {}) {
  return {
    id: "m-1",
    tipoIdentificacion: "CC",
    numeroDocumento: "12345678",
    nombres: "JUAN",
    apellidos: "PEREZ",
    fechaNacimiento: "01/01/2000",
    parentesco: "CF",
    sexo: "M",
    estadoCivil: "S",
    profesion: "OBRERO",
    escolaridad: "PR",
    integrantes: 1,
    direccion: "CALLE 1",
    telefono: "3001234567",
    novedad: null,
    activo: true,
    estado: "ACTIVO",
    fechaAlta: new Date("2026-01-01"),
    fechaBaja: null,
    familiaId: "fam-1",
    cabildoId: "cab-1",
    familia: {
      id: "fam-1",
      numero: 7,
      direccion: "CALLE 1",
      telefono: "3001234567",
      cabildoId: "cab-1",
    },
    cabildo: {
      id: "cab-1",
      nombre: "Cabildo Test",
      resguardo: "RESGUARDO TEST",
      comunidad: "COMUNIDAD TEST",
      vigencia: 2026,
      activo: true,
    },
    ...overrides,
  };
}

/** Simulates a child process that emits 'close' with the given exit code.
 *  If `writeOnClose` is a path, the file is written RIGHT BEFORE closing —
 *  simulates the formatter effect (creating the xlsx) before failing. */
function fakeChildProcess(exitCode: number, writeOnClose?: string) {
  const child = new EventEmitter() as EventEmitter & {
    stderr: EventEmitter;
    stdout: EventEmitter;
  };
  child.stderr = new EventEmitter();
  child.stdout = new EventEmitter();
  process.nextTick(() => {
    if (writeOnClose) writeFileSync(writeOnClose, "parcial");
    child.emit("close", exitCode);
  });
  return child;
}

function mockRes() {
  const res: Partial<Response> = {
    download: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

function mockNext() {
  return vi.fn() as NextFunction;
}

/** Reads the temp paths passed to the script from the spawn args */
function getTmpPaths() {
  const args = spawnMock.mock.calls[0][1] as string[];
  const tmpJson = args[args.indexOf("--data") + 1];
  const tmpXlsx = args[args.indexOf("--output") + 1];
  return { tmpJson, tmpXlsx };
}

describe("reporteController.generarCenso", () => {
  let reportesDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock.mockReturnValue(fakeChildProcess(0));
    // Isolates the test in a temp dir: the shared helper resolves
    // TATACHIO_REPORTES_DIR at runtime (decision 2026-08-14, issue #60).
    reportesDir = mkdtempSync(path.join(os.tmpdir(), "tatachio-reportes-"));
    process.env.TATACHIO_REPORTES_DIR = reportesDir;
  });

  afterEach(() => {
    delete process.env.TATACHIO_REPORTES_DIR;
    rmSync(reportesDir, { recursive: true, force: true });
  });

  it("consulta DB, genera el JSON correcto y llama al script formateador", async () => {
    const miembroActivo = makeMiembro();
    const miembroAlta = makeMiembro({
      id: "m-2",
      numeroDocumento: "87654321",
      nombres: "ANA",
      apellidos: "LOPEZ",
      parentesco: "HI",
      sexo: "F",
      estado: "PENDIENTE",
      integrantes: 2,
      familia: { ...makeMiembro().familia, numero: 8 },
    });
    const miembroBaja = makeMiembro({
      id: "m-3",
      numeroDocumento: "11223344",
      nombres: "LUIS",
      apellidos: "GOMEZ",
      estado: "BAJA",
      fechaBaja: new Date("2026-05-01"),
      novedad: "RETIRO VOLUNTARIO",
      familia: { ...makeMiembro().familia, numero: 9 },
    });

    vi.mocked(prisma.miembro.findMany)
      .mockResolvedValueOnce([miembroActivo] as never)
      .mockResolvedValueOnce([miembroAlta] as never)
      .mockResolvedValueOnce([miembroBaja] as never);

    const req = {} as Request;
    const res = mockRes();
    const next = mockNext();

    await generarCenso(req, res, next);

    // 1. The 3 populations are queried with the design filters
    expect(prisma.miembro.findMany).toHaveBeenCalledTimes(3);
    expect(vi.mocked(prisma.miembro.findMany).mock.calls[0][0]).toEqual(
      expect.objectContaining({ where: { estado: "ACTIVO" } }),
    );
    expect(vi.mocked(prisma.miembro.findMany).mock.calls[1][0]).toEqual(
      expect.objectContaining({ where: { estado: "PENDIENTE" } }),
    );
    expect(vi.mocked(prisma.miembro.findMany).mock.calls[2][0]).toEqual(
      expect.objectContaining({ where: { estado: "BAJA" } }),
    );

    // 2. The script is invoked with python3, the formatter path and the temp files
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnMock.mock.calls[0] as [string, string[]];
    expect(cmd).toBe("python3");
    expect(args[0]).toBe(
      path.resolve(
        import.meta.dirname,
        "../../../../scripts/excel-formateador/formateador.py",
      ),
    );

    // 3. The temp JSON holds the 3 sections with the exact template keys.
    //    The intermediate JSON stays in os.tmpdir(); the xlsx goes to the shared dir.
    const { tmpJson, tmpXlsx } = getTmpPaths();
    expect(tmpJson).toMatch(/reporte-\d+-[a-z0-9]+\.json$/);
    expect(tmpXlsx).toBe(path.join(reportesDir, `censo-${new Date().getFullYear()}.xlsx`));

    const data = JSON.parse(readFileSync(tmpJson, "utf-8")) as {
      censo: Record<string, unknown>[];
      altas: Record<string, unknown>[];
      bajas: Record<string, unknown>[];
    };

    // Census section: 18 template keys (real template VIGENCIA: "1. VIGENCIA")
    expect(data.censo).toHaveLength(1);
    expect(Object.keys(data.censo[0])).toHaveLength(18);
    expect(data.censo[0]).toEqual({
      "1. VIGENCIA": 2026,
      "RESGUARDO INDIGENA": "RESGUARDO TEST",
      "COMUNIDAD INDIGENA": "COMUNIDAD TEST",
      FAMILIA: 7,
      "TIPO IDENTIFICACION": "CC",
      "NUMERO DOCUMENTO": "12345678",
      NOMBRES: "JUAN",
      APELLIDOS: "PEREZ",
      "FECHA NACIMIENTO": "01/01/2000",
      PARENTESCO: "CF",
      SEXO: "M",
      "ESTADO CIVIL": "S",
      PROFESION: "OBRERO",
      ESCOLARIDAD: "PR",
      INTEGRANTES: 1,
      DIRECCION: "CALLE 1",
      TELEFONO: "3001234567",
      USUARIO: "SISTEMA",
    });

    // Altas section: 15 keys, explicit member NOVEDAD
    expect(data.altas).toHaveLength(1);
    expect(Object.keys(data.altas[0])).toHaveLength(15);
    expect(data.altas[0]).toEqual(
      expect.objectContaining({
        IDENTIFICACION: "CC",
        ESTADOCIVIL: "S",
        NOVEDAD: "ALTA NUEVA",
      }),
    );

    // Bajas section: 15 keys, NOVEDAD keeps the member's value
    expect(data.bajas).toHaveLength(1);
    expect(Object.keys(data.bajas[0])).toHaveLength(15);
    expect(data.bajas[0]).toEqual(
      expect.objectContaining({
        IDENTIFICACION: "CC",
        ESTADOCIVIL: "S",
        NOVEDAD: "RETIRO VOLUNTARIO",
      }),
    );

    // 4. The xlsx is downloaded from the shared dir as censo-{year}.xlsx
    expect(res.download).toHaveBeenCalledTimes(1);
    expect(res.download).toHaveBeenCalledWith(
      path.join(reportesDir, `censo-${new Date().getFullYear()}.xlsx`),
      `censo-${new Date().getFullYear()}.xlsx`,
      expect.any(Function),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("usa valores vacíos para campos nulos y NOVEDAD por defecto en altas", async () => {
    const miembroAlta = makeMiembro({
      id: "m-4",
      estado: "PENDIENTE",
      estadoCivil: null,
      profesion: null,
      escolaridad: null,
      direccion: null,
      telefono: null,
    });

    vi.mocked(prisma.miembro.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([miembroAlta] as never)
      .mockResolvedValueOnce([] as never);

    const req = {} as Request;
    const res = mockRes();
    const next = mockNext();

    await generarCenso(req, res, next);

    const { tmpJson } = getTmpPaths();
    const data = JSON.parse(readFileSync(tmpJson, "utf-8")) as {
      censo: unknown[];
      altas: Record<string, unknown>[];
      bajas: unknown[];
    };

    expect(data.censo).toEqual([]);
    expect(data.bajas).toEqual([]);
    expect(data.altas).toHaveLength(1);
    expect(data.altas[0]).toEqual(
      expect.objectContaining({
        ESTADOCIVIL: "",
        PROFESION: "",
        ESCOLARIDAD: "",
        NOVEDAD: "ALTA NUEVA",
      }),
    );
    // Altas rows have NO DIRECCION/TELEFONO/USUARIO (15 keys only)
    expect(data.altas[0]).not.toHaveProperty("DIRECCION");
    expect(data.altas[0]).not.toHaveProperty("USUARIO");
  });

  it("usa NOVEDAD 'BAJA VOLUNTARIA' por defecto en bajas", async () => {
    const miembroBaja = makeMiembro({
      id: "m-5",
      estado: "BAJA",
      fechaBaja: new Date("2026-05-01"),
    });

    vi.mocked(prisma.miembro.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([miembroBaja] as never);

    const req = {} as Request;
    const res = mockRes();
    const next = mockNext();

    await generarCenso(req, res, next);

    const { tmpJson } = getTmpPaths();
    const data = JSON.parse(readFileSync(tmpJson, "utf-8")) as {
      bajas: Record<string, unknown>[];
    };

    expect(data.bajas).toHaveLength(1);
    expect(data.bajas[0]).toEqual(
      expect.objectContaining({ NOVEDAD: "BAJA VOLUNTARIA" }),
    );
  });

  it("persiste el xlsx en la carpeta compartida y limpia solo el temporal tras la descarga", async () => {
    vi.mocked(prisma.miembro.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const req = {} as Request;
    const res = mockRes();
    const next = mockNext();

    await generarCenso(req, res, next);

    const { tmpJson, tmpXlsx } = getTmpPaths();
    expect(tmpXlsx).toBe(path.join(reportesDir, `censo-${new Date().getFullYear()}.xlsx`));
    // The (mocked) script does not produce the xlsx; simulate its output to verify
    // the successful file PERSISTS in the shared dir.
    writeFileSync(tmpXlsx, "mock-xlsx");
    expect(existsSync(tmpJson)).toBe(true);
    expect(existsSync(tmpXlsx)).toBe(true);

    // Invoking the res.download callback simulates the completed transfer
    const callback = (res.download as ReturnType<typeof vi.fn>).mock.calls[0][2] as () => void;
    callback();

    expect(existsSync(tmpJson)).toBe(false);
    // Success → the report is NOT cleaned (decision 2026-08-14, issue #60)
    expect(existsSync(tmpXlsx)).toBe(true);
  });

  it("propaga el error y limpia (json temporal + xlsx parcial propio) cuando el script falla", async () => {
    vi.mocked(prisma.miembro.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    // The formatter fails AFTER creating a partial xlsx (writeOnClose):
    // the partial belongs to THIS request, so cleanup must remove it.
    const partialXlsx = path.join(reportesDir, `censo-${new Date().getFullYear()}.xlsx`);
    spawnMock.mockReturnValue(fakeChildProcess(1, partialXlsx));

    const req = {} as Request;
    const res = mockRes();
    const next = mockNext();

    await generarCenso(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.download).not.toHaveBeenCalled();

    const { tmpJson, tmpXlsx } = getTmpPaths();
    expect(tmpXlsx).toBe(partialXlsx);
    expect(existsSync(tmpJson)).toBe(false);
    expect(existsSync(tmpXlsx)).toBe(false);
  });

  it("preserva un reporte previo válido cuando esta request falla (R4-001)", async () => {
    // Valid report already persisted by a previous generation this year.
    const previo = path.join(reportesDir, `censo-${new Date().getFullYear()}.xlsx`);
    writeFileSync(previo, "reporte-previo-valido");

    vi.mocked(prisma.miembro.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    // This request fails without writing anything: the catch must not touch the previous report.
    spawnMock.mockReturnValue(fakeChildProcess(1));

    const req = {} as Request;
    const res = mockRes();
    const next = mockNext();

    await generarCenso(req, res, next);

    expect(res.download).not.toHaveBeenCalled();
    expect(existsSync(previo)).toBe(true);
    expect(readFileSync(previo, "utf-8")).toBe("reporte-previo-valido");

    // The temp JSON of the failed request is still cleaned up.
    const { tmpJson } = getTmpPaths();
    expect(existsSync(tmpJson)).toBe(false);
  });
});
