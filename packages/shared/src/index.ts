import { z } from "zod";
import { homedir } from "node:os";
import { join } from "node:path";

export const TipoIdentificacionEnum = z.enum(["CC", "TI", "RC", "NUIP"]);
export const ParentescoEnum = z.enum([
  "PA", "MA", "CO", "HE", "CF", "ES", "HI",
  "YR", "NU", "SU", "SO", "CU", "TI", "AB", "NI",
]);
export const SexoEnum = z.enum(["M", "F"]);
export const EstadoCivilEnum = z.enum(["S", "C"]);
export const EscolaridadEnum = z.enum(["PR", "SE", "UN", "NI"]);

export const memberSchema = z.object({
  tipoIdentificacion: TipoIdentificacionEnum,
  numeroDocumento: z.string().min(1),
  nombres: z.string().min(1),
  apellidos: z.string().min(1),
  fechaNacimiento: z
    .string()
    .regex(/^\d{2}\/\d{2}\/\d{4}$/, "Formato esperado: DD/MM/YYYY")
    .refine((val) => {
      const [day, month, year] = val.split("/").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    }, "Fecha de nacimiento inválida (no existe en el calendario)")
    .refine((val) => {
      const year = parseInt(val.split("/")[2], 10);
      return year <= new Date().getFullYear();
    }, "Fecha de nacimiento no puede ser futura"),
  parentesco: ParentescoEnum,
  sexo: SexoEnum,
  estadoCivil: EstadoCivilEnum.optional(),
  profesion: z.string().optional(),
  escolaridad: EscolaridadEnum.optional(),
  integrantes: z.number().int().positive(),
  direccion: z.string().optional(),
  telefono: z.string().optional(),
  novedad: z.string().optional(),
  familiaId: z.string().uuid(),
  cabildoId: z.string().uuid().optional(),
});

// Age above which a member is flagged with a warning (presumed dead / data error).
// Census data oldest real record is 09/07/1931 (~95 years); 99 keeps the warning
// tight while not flagging legitimate records.
export const MAX_PLAUSIBLE_AGE_YEARS = 99;

export function ageFromFechaNacimiento(fechaNacimiento: string): number {
  const [day, month, year] = fechaNacimiento.split("/").map(Number);
  const birth = new Date(Date.UTC(year, month - 1, day));
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export type MemberInput = z.infer<typeof memberSchema>;

export const cabildoSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  resguardo: z.string().min(1, "El resguardo es requerido"),
  comunidad: z.string().min(1, "La comunidad es requerida"),
  vigencia: z.number().int().min(2000).max(2100),
});

export type CabildoInput = z.infer<typeof cabildoSchema>;

export const familiaSchema = z.object({
  numero: z.number().int().positive("El número de familia debe ser positivo"),
  direccion: z.string().optional(),
  telefono: z.string().optional(),
  cabildoId: z.string().uuid("CabildoId debe ser un UUID válido"),
});

export type FamiliaInput = z.infer<typeof familiaSchema>;

// ── Carpeta compartida de reportes (decisión 2026-08-14, issue #60) ──────
// Una sola fuente de verdad para backend y CLI: TATACHIO_REPORTES_DIR si está
// seteada, si no ~/.tatachio/reportes/. Fuera del repo (nunca en git); quien
// la consume hace mkdir(dir, { recursive: true }) en runtime.
export const REPORTES_DIR_ENV = "TATACHIO_REPORTES_DIR";

export function resolveReportesDir(env: Record<string, string | undefined> = process.env): string {
  const fromEnv = env[REPORTES_DIR_ENV]?.trim();
  return fromEnv || join(homedir(), ".tatachio", "reportes");
}
