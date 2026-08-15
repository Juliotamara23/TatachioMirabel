import { useForm } from "react-hook-form";
import { useCabildo } from "../../contexts/CabildoContext";
import { register, type RegisterInput } from "../../lib/api/auth";

interface CapitanasRegisterFormProps {
  onSuccess?: () => void;
}

interface FormValues {
  email: string;
  nombre: string;
  password: string;
  cabildoId: string;
}

export function CapitanasRegisterForm({ onSuccess }: CapitanasRegisterFormProps) {
  const { list: cabildos } = useCabildo();
  const { register: rhfRegister, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    defaultValues: {
      email: "",
      nombre: "",
      password: "",
      cabildoId: "",
    },
  });

  const onSubmit = async (data: FormValues) => {
    const payload: RegisterInput = {
      email: data.email,
      password: data.password,
      nombre: data.nombre,
      rol: "CAPTAIN",
      cabildoId: data.cabildoId,
    };
    await register(payload);
    onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email *
          </label>
          <input
            {...rhfRegister("email", { required: "Email es requerido" })}
            type="email"
            id="email"
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
        </div>

        <div>
          <label htmlFor="nombre" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Nombre *
          </label>
          <input
            {...rhfRegister("nombre", { required: "Nombre es requerido" })}
            id="nombre"
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          {errors.nombre && <p className="mt-1 text-xs text-red-500">{errors.nombre.message}</p>}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Contraseña *
          </label>
          <input
            {...rhfRegister("password", { required: "Contraseña es requerida", minLength: { value: 6, message: "Mínimo 6 caracteres" } })}
            type="password"
            id="password"
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
        </div>

        <div>
          <label htmlFor="cabildoId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Cabildo *
          </label>
          <select
            {...rhfRegister("cabildoId", { required: "Cabildo es requerido" })}
            id="cabildoId"
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">Seleccionar cabildo...</option>
            {cabildos.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          {errors.cabildoId && <p className="mt-1 text-xs text-red-500">{errors.cabildoId.message}</p>}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        El rol será <strong>CAPTAIN</strong> (Capitana). El usuario se registrará y asociará al cabildo seleccionado.
      </p>

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-orange-brand px-4 py-2 text-sm font-medium text-white hover:bg-orange-brand-light disabled:opacity-50"
      >
        {isSubmitting ? "Registrando..." : "Registrar Capitana"}
      </button>
    </form>
  );
}
