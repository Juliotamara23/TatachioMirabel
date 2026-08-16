import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { listCabildos, deleteCabildo } from "../../lib/api/cabildos";
import { ApiError } from "../../lib/api/client";
import { Table } from "../../components/Table";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { CabildoForm } from "./CabildoForm";
import type { Cabildo } from "../../types/api";

export function CabildosPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [cabildos, setCabildos] = useState<Cabildo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Cabildo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Cabildo | null>(null);

  const isAdmin = user?.rol === "ADMINISTRATOR";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listCabildos();
      setCabildos(data);
    } catch {
      setCabildos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = (cabildo: Cabildo) => {
    setDeleteTarget(cabildo);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteCabildo(target.id);
      toast.success("Cabildo eliminado correctamente");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.body.error : "Error al eliminar cabildo");
    }
  };

  const handleEdit = (cabildo: Cabildo) => {
    setEditing(cabildo);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    // TOAST-2: create vs update toast, based on whether a cabildo was being edited.
    toast.success(editing ? "Cabildo actualizado correctamente" : "Cabildo creado correctamente");
    setShowForm(false);
    setEditing(null);
    load();
  };

  const columns = [
    { key: "nombre", header: "Nombre", render: (c: Cabildo) => c.nombre },
    { key: "resguardo", header: "Resguardo", render: (c: Cabildo) => c.resguardo },
    { key: "comunidad", header: "Comunidad", render: (c: Cabildo) => c.comunidad },
    { key: "vigencia", header: "Vigencia", render: (c: Cabildo) => c.vigencia },
    ...(isAdmin
      ? [
          {
            key: "actions",
            header: "",
            render: (c: Cabildo) => (
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleEdit(c)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(c)}
                  className="text-xs text-red-600 hover:underline"
                  data-testid="delete-btn"
                >
                  Eliminar
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  if (loading) {
    return <div>Cargando cabildos...</div>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Cabildos</h2>
        {isAdmin && (
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="rounded bg-orange-brand px-3 py-1.5 text-sm text-white hover:bg-orange-brand-light"
          >
            Nuevo Cabildo
          </button>
        )}
      </div>

      {showForm && isAdmin && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-surface-muted-dark">
          <h3 className="mb-3 text-lg font-semibold">{editing ? "Editar Cabildo" : "Nuevo Cabildo"}</h3>
          <CabildoForm cabildo={editing ?? undefined} onSuccess={handleFormSuccess} />
          <button
            onClick={() => { setShowForm(false); setEditing(null); }}
            className="mt-2 text-sm text-gray-500 hover:underline"
          >
            Cancelar
          </button>
        </div>
      )}

      <Table
        columns={columns}
        rows={cabildos}
        getRowKey={(c) => c.id}
        emptyMessage="Sin datos"
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar cabildo"
        message={`¿Estás seguro de eliminar el cabildo ${deleteTarget?.nombre ?? ""}?`}
        confirmLabel="Eliminar"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
