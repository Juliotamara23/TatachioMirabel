import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

/** Simula un proceso hijo que emite 'close' con el código indicado */
function fakeChildProcess(exitCode: number) {
  const child = new EventEmitter() as EventEmitter & {
    stderr: EventEmitter;
    stdout: EventEmitter;
  };
  child.stderr = new EventEmitter();
  child.stdout = new EventEmitter();
  process.nextTick(() => child.emit("close", exitCode));
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

/** Lee los paths temporales pasados al script a partir de los args de spawn */
function getTmpPaths() {
  const args = spawnMock.mock.calls[0][1] as string[];
  const tmpJson = args[args.indexOf("--data") + 1];
  const tmpXlsx = args[args.indexOf("--output") + 1];
  return { tmpJson, tmpXlsx };
}

describe("reporteController.generarCenso", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock.mockReturnValue(fakeChildProcess(0));
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

    // 1. Se consultan las 3 poblaciones con los filtros del diseño
    expect(prisma.miembro.findMany).toHaveBeenCalledTimes(3);
    expect(vi.mocked(prisma.miembro.findMany).mock.calls[0][0]).toEqual(
      expect.objectContaining({ where: { estado: "ACTIVO" } }),
    );
    expect(vi.mocked(prisma.miembro.findMany).mock.calls[1][0]).toEqual(
      expect.objectContaining({
        where: { OR: expect.arrayContaining([expect.any(Object), expect.any(Object)]) },
      }),
    );
    expect(vi.mocked(prisma.miembro.findMany).mock.calls[2][0]).toEqual(
      expect.objectContaining({
        where: { OR: expect.arrayContaining([expect.any(Object), expect.any(Object)]) },
      }),
    );

    // 2. Se invoca el script con python3, la ruta del formateador y los temporales
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnMock.mock.calls[0] as [string, string[]];
    expect(cmd).toBe("python3");
    expect(args[0]).toBe(
      path.resolve(
        import.meta.dirname,
        "../../../../scripts/excel-formateador/formateador.py",
      ),
    );

    // 3. El JSON temporal contiene las 3 secciones con las claves exactas del template
    const { tmpJson, tmpXlsx } = getTmpPaths();
    expect(tmpJson).toMatch(/reporte-\d+-[a-z0-9]+\.json$/);
    expect(tmpXlsx).toMatch(/reporte-\d+-[a-z0-9]+\.xlsx$/);

    const data = JSON.parse(readFileSync(tmpJson, "utf-8")) as {
      censo: Record<string, unknown>[];
      altas: Record<string, unknown>[];
      bajas: Record<string, unknown>[];
    };

    // Sección censo: 18 claves del template (VIGENCIA real del template: "1. VIGENCIA")
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

    // Sección altas: 15 claves, NOVEDAD explícita del miembro
    expect(data.altas).toHaveLength(1);
    expect(Object.keys(data.altas[0])).toHaveLength(15);
    expect(data.altas[0]).toEqual(
      expect.objectContaining({
        IDENTIFICACION: "CC",
        ESTADOCIVIL: "S",
        NOVEDAD: "ALTA NUEVA",
      }),
    );

    // Sección bajas: 15 claves, NOVEDAD conserva la del miembro
    expect(data.bajas).toHaveLength(1);
    expect(Object.keys(data.bajas[0])).toHaveLength(15);
    expect(data.bajas[0]).toEqual(
      expect.objectContaining({
        IDENTIFICACION: "CC",
        ESTADOCIVIL: "S",
        NOVEDAD: "RETIRO VOLUNTARIO",
      }),
    );

    // 4. Se descarga el xlsx con el nombre censo-{año}.xlsx
    expect(res.download).toHaveBeenCalledTimes(1);
    expect(res.download).toHaveBeenCalledWith(
      tmpXlsx,
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
    // Las filas de altas NO llevan DIRECCION/TELEFONO/USUARIO (solo 15 claves)
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

  it("limpia los temporales después de descargar el xlsx", async () => {
    vi.mocked(prisma.miembro.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const req = {} as Request;
    const res = mockRes();
    const next = mockNext();

    await generarCenso(req, res, next);

    const { tmpJson, tmpXlsx } = getTmpPaths();
    // El script (mockeado) no produce el xlsx; simular su salida para verificar el cleanup
    writeFileSync(tmpXlsx, "mock-xlsx");
    expect(existsSync(tmpJson)).toBe(true);
    expect(existsSync(tmpXlsx)).toBe(true);

    // Invocar el callback de res.download simula la transferencia completada
    const callback = (res.download as ReturnType<typeof vi.fn>).mock.calls[0][2] as () => void;
    callback();

    expect(existsSync(tmpJson)).toBe(false);
    expect(existsSync(tmpXlsx)).toBe(false);
  });

  it("propaga el error y limpia cuando el script falla", async () => {
    vi.mocked(prisma.miembro.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    spawnMock.mockReturnValue(fakeChildProcess(1));

    const req = {} as Request;
    const res = mockRes();
    const next = mockNext();

    await generarCenso(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.download).not.toHaveBeenCalled();

    const { tmpJson, tmpXlsx } = getTmpPaths();
    expect(existsSync(tmpJson)).toBe(false);
    expect(existsSync(tmpXlsx)).toBe(false);
  });
});
