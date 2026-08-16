import { useEffect, useState, useCallback } from "react";
import { useCabildo } from "../../contexts/CabildoContext";
import { useToast } from "../../contexts/ToastContext";
import { listCaptains, removeCaptain } from "../../lib/api/admin";
import { ApiError } from "../../lib/api/client";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import type { Captain } from "../../types/api";

export function CapitanasList() {
  const { selectedId } = useCabildo();
  const { toast } = useToast();
  const [captains, setCaptains] = useState<Captain[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogCaptain, setDialogCaptain] = useState<Captain | null>(null);

  const load = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const data = await listCaptains(selectedId);
      setCaptains(data);
    } catch {
      setCaptains([]);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUnassign = async (captain: Captain) => {
    if (!selectedId) return;

    try {
      await removeCaptain(selectedId, captain.id);
      toast.success("Capitana removida correctamente");
      await load();
    } catch (err) {
      // TOAST-2: 409 (last captain) surfaces the server message verbatim
      // ("El cabildo debe tener al menos una capitana").
      toast.error(err instanceof ApiError ? err.body.error : "Error al remover capitana");
    }
    setDialogCaptain(null);
  };

  if (loading) {
    return <div>Cargando capitanas...</div>;
  }

  if (captains.length === 0) {
    return <p className="text-sm text-gray-500">No hay capitanas registradas en este cabildo.</p>;
  }

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-surface-muted-dark">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Nombre</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Email</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Estado</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {captains.map((c) => (
              <tr key={c.id} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{c.nombre}</td>
                <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{c.email}</td>
                <td className="px-4 py-2 text-sm">
                  <span className={c.activo ? "text-green-600" : "text-red-600"}>
                    {c.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => setDialogCaptain(c)}
                    disabled={captains.length <= 1}
                    className="text-xs text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid={`unassign-btn-${c.id}`}
                    title={captains.length <= 1 ? "No se puede remover la última capitana" : "Desasignar"}
                  >
                    Desasignar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={dialogCaptain !== null}
        title="Desasignar capitana"
        message={`¿Estás seguro de desasignar a ${dialogCaptain?.nombre ?? ""}?`}
        confirmLabel="Desasignar"
        onConfirm={() => dialogCaptain && handleUnassign(dialogCaptain)}
        onCancel={() => setDialogCaptain(null)}
      />
    </div>
  );
}
