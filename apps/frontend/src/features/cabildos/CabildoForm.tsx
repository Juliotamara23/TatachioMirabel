import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cabildoSchema, type CabildoInput } from "@tatachio/shared";
import { createCabildo, updateCabildo } from "../../lib/api/cabildos";
import { useToast } from "../../contexts/ToastContext";
import { ApiError } from "../../lib/api/client";
import type { Cabildo } from "../../types/api";

interface CabildoFormProps {
  cabildo?: Cabildo;
  onSuccess?: () => void;
}

export function CabildoForm({ cabildo, onSuccess }: CabildoFormProps) {
  const isEditing = !!cabildo;
  const { toast } = useToast();

  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<CabildoInput>({
    resolver: zodResolver(cabildoSchema),
    defaultValues: cabildo ?? {
      nombre: "",
      resguardo: "",
      comunidad: "",
      vigencia: new Date().getFullYear(),
    },
  });

  const onSubmit = async (data: CabildoInput) => {
    try {
      if (isEditing && cabildo) {
        await updateCabildo(cabildo.id, data);
      } else {
        await createCabildo(data);
      }
    } catch (err) {
      // TOAST-2: surface the API error message without an unhandled rejection;
      // the form stays open so the user can retry.
      toast.error(err instanceof ApiError ? err.body.error : "Error al guardar el cabildo");
      return;
    }
    onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="nombre" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Nombre *
          </label>
          <Controller
            name="nombre"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                id="nombre"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            )}
          />
          {errors.nombre && <p className="mt-1 text-xs text-red-500">{errors.nombre.message}</p>}
        </div>

        <div>
          <label htmlFor="resguardo" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Resguardo *
          </label>
          <Controller
            name="resguardo"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                id="resguardo"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            )}
          />
          {errors.resguardo && <p className="mt-1 text-xs text-red-500">{errors.resguardo.message}</p>}
        </div>

        <div>
          <label htmlFor="comunidad" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Comunidad *
          </label>
          <Controller
            name="comunidad"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                id="comunidad"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            )}
          />
          {errors.comunidad && <p className="mt-1 text-xs text-red-500">{errors.comunidad.message}</p>}
        </div>

        <div>
          <label htmlFor="vigencia" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Vigencia *
          </label>
          <Controller
            name="vigencia"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                type="number"
                id="vigencia"
                onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            )}
          />
          {errors.vigencia && <p className="mt-1 text-xs text-red-500">{errors.vigencia.message as string}</p>}
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
