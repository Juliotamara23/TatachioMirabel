import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { familiaSchema, type FamiliaInput } from "@tatachio/shared";
import { createFamilia, updateFamilia, type Familia } from "../../lib/api/familias";
import { useCabildo } from "../../contexts/CabildoContext";
import { useToast } from "../../contexts/ToastContext";
import { ApiError } from "../../lib/api/client";

interface FamiliaFormProps {
  familia?: Familia;
  onSuccess?: () => void;
}

function familiaToDefaults(familia: Familia): FamiliaInput {
  return {
    numero: familia.numero,
    direccion: familia.direccion ?? undefined,
    telefono: familia.telefono ?? undefined,
    cabildoId: familia.cabildoId,
  };
}

export function FamiliaForm({ familia, onSuccess }: FamiliaFormProps) {
  const { selectedId } = useCabildo();
  const { toast } = useToast();
  const isEditing = !!familia;

  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FamiliaInput>({
    resolver: zodResolver(familiaSchema),
    defaultValues: familia ? familiaToDefaults(familia) : {
      numero: 0,
      direccion: "",
      telefono: "",
      cabildoId: selectedId ?? "",
    },
  });

  const onSubmit = async (data: FamiliaInput) => {
    const payload = { ...data, cabildoId: selectedId ?? data.cabildoId };
    try {
      if (isEditing && familia) {
        await updateFamilia(familia.id, payload);
      } else {
        await createFamilia(payload);
      }
    } catch (err) {
      // TOAST-2: surface the API error message (e.g. duplicate numero) without
      // an unhandled rejection; the form stays open so the user can retry.
      toast.error(err instanceof ApiError ? err.body.error : "Error al guardar la familia");
      return;
    }
    onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label htmlFor="numero" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Número de Familia *
          </label>
          <Controller
            name="numero"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                type="number"
                id="numero"
                onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            )}
          />
          {errors.numero && <p className="mt-1 text-xs text-red-500">{errors.numero.message}</p>}
        </div>

        <div>
          <label htmlFor="direccion" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Dirección
          </label>
          <Controller
            name="direccion"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                id="direccion"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            )}
          />
        </div>

        <div>
          <label htmlFor="telefono" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Teléfono
          </label>
          <Controller
            name="telefono"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                id="telefono"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            )}
          />
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
