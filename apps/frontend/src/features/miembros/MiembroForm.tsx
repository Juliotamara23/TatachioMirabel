import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { memberSchema, type MemberInput } from "@tatachio/shared";
import { createMiembro, updateMiembro, type Miembro } from "../../lib/api/miembros";
import { useCabildo } from "../../contexts/CabildoContext";

interface MiembroFormProps {
  member?: Miembro;
  onSuccess?: () => void;
}

const TIPO_OPTIONS = ["CC", "TI", "RC", "NUIP"] as const;
const SEXO_OPTIONS = ["M", "F"] as const;
const PARENTESCO_OPTIONS = [
  "PA", "MA", "CO", "HE", "CF", "ES", "HI",
  "YR", "NU", "SU", "SO", "CU", "TI", "AB", "NI",
] as const;

function memberToDefaults(member: Miembro): MemberInput {
  return {
    tipoIdentificacion: member.tipoIdentificacion as MemberInput["tipoIdentificacion"],
    numeroDocumento: member.numeroDocumento,
    nombres: member.nombres,
    apellidos: member.apellidos,
    fechaNacimiento: member.fechaNacimiento,
    parentesco: member.parentesco as MemberInput["parentesco"],
    sexo: member.sexo as MemberInput["sexo"],
    estadoCivil: (member.estadoCivil ?? undefined) as MemberInput["estadoCivil"],
    profesion: member.profesion ?? undefined,
    escolaridad: (member.escolaridad ?? undefined) as MemberInput["escolaridad"],
    integrantes: member.integrantes,
    direccion: member.direccion ?? undefined,
    telefono: member.telefono ?? undefined,
    novedad: member.novedad ?? undefined,
    familiaId: member.familiaId,
    cabildoId: member.cabildoId,
  };
}

export function MiembroForm({ member, onSuccess }: MiembroFormProps) {
  const { selectedId } = useCabildo();
  const isEditing = !!member;

  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<MemberInput>({
    resolver: zodResolver(memberSchema),
    defaultValues: member ? memberToDefaults(member) : {
      tipoIdentificacion: "CC" as const,
      numeroDocumento: "",
      nombres: "",
      apellidos: "",
      fechaNacimiento: "",
      parentesco: "HI" as const,
      sexo: "M" as const,
      integrantes: 1,
      familiaId: "",
      cabildoId: selectedId ?? "",
    },
  });

  const onSubmit = async (data: MemberInput) => {
    const payload = { ...data, cabildoId: selectedId ?? data.cabildoId };
    if (isEditing && member) {
      await updateMiembro(member.id, payload);
    } else {
      await createMiembro(payload);
    }
    onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Nombres */}
        <div>
          <label htmlFor="nombres" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Nombres *
          </label>
          <Controller
            name="nombres"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                id="nombres"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            )}
          />
          {errors.nombres && <p className="mt-1 text-xs text-red-500">{errors.nombres.message}</p>}
        </div>

        {/* Apellidos */}
        <div>
          <label htmlFor="apellidos" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Apellidos *
          </label>
          <Controller
            name="apellidos"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                id="apellidos"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            )}
          />
          {errors.apellidos && <p className="mt-1 text-xs text-red-500">{errors.apellidos.message}</p>}
        </div>

        {/* Tipo Identificación */}
        <div>
          <label htmlFor="tipoIdentificacion" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Tipo Identificación *
          </label>
          <Controller
            name="tipoIdentificacion"
            control={control}
            render={({ field }) => (
              <select
                {...field}
                id="tipoIdentificacion"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                {TIPO_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            )}
          />
        </div>

        {/* Número Documento */}
        <div>
          <label htmlFor="numeroDocumento" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Número Documento *
          </label>
          <Controller
            name="numeroDocumento"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                id="numeroDocumento"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            )}
          />
          {errors.numeroDocumento && <p className="mt-1 text-xs text-red-500">{errors.numeroDocumento.message}</p>}
        </div>

        {/* Fecha Nacimiento */}
        <div>
          <label htmlFor="fechaNacimiento" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Fecha Nacimiento (DD/MM/YYYY) *
          </label>
          <Controller
            name="fechaNacimiento"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                id="fechaNacimiento"
                placeholder="DD/MM/YYYY"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            )}
          />
          {errors.fechaNacimiento && <p className="mt-1 text-xs text-red-500">{errors.fechaNacimiento.message}</p>}
        </div>

        {/* Sexo */}
        <div>
          <label htmlFor="sexo" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Sexo *
          </label>
          <Controller
            name="sexo"
            control={control}
            render={({ field }) => (
              <select
                {...field}
                id="sexo"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                {SEXO_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            )}
          />
        </div>

        {/* Parentesco */}
        <div>
          <label htmlFor="parentesco" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Parentesco *
          </label>
          <Controller
            name="parentesco"
            control={control}
            render={({ field }) => (
              <select
                {...field}
                id="parentesco"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                {PARENTESCO_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            )}
          />
        </div>

        {/* Integrantes */}
        <div>
          <label htmlFor="integrantes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Integrantes *
          </label>
          <Controller
            name="integrantes"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                type="number"
                id="integrantes"
                onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            )}
          />
        </div>

        {/* Familia ID */}
        <div>
          <label htmlFor="familiaId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Familia ID *
          </label>
          <Controller
            name="familiaId"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                id="familiaId"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            )}
          />
          {errors.familiaId && <p className="mt-1 text-xs text-red-500">{errors.familiaId.message}</p>}
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-orange-brand px-4 py-2 text-sm font-medium text-white hover:bg-orange-brand-light disabled:opacity-50"
      >
        {isSubmitting ? "Guardando..." : isEditing ? "Actualizar" : "Guardar"}
      </button>
    </form>
  );
}
