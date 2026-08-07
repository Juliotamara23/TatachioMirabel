import { z } from "zod";

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
  fechaNacimiento: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, "Formato esperado: DD/MM/YYYY"),
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
