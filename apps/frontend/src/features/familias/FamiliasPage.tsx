import { useEffect, useState, useCallback } from "react";
import { useCabildo } from "../../contexts/CabildoContext";
import { useToast } from "../../contexts/ToastContext";
import { listFamilias, deleteFamilia, type Familia } from "../../lib/api/familias";
import { ApiError } from "../../lib/api/client";
import { Table } from "../../components/Table";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { FamiliaForm } from "./FamiliaForm";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

export function FamiliasPage() {
  const { selectedId } = useCabildo();
  const { toast } = useToast();
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Familia | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Familia | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const load = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const data = await listFamilias({
        cabildoId: selectedId,
        search: debouncedSearch || undefined,
      });
      setFamilias(data);
    } catch {
      setFamilias([]);
    } finally {
      setLoading(false);
    }
  }, [selectedId, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = (familia: Familia) => {
    setDeleteTarget(familia);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteFamilia(target.id);
      toast.success("Familia eliminada correctamente");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.body.error : "Error al eliminar familia");
    }
  };

  const handleEdit = (familia: Familia) => {
    setEditing(familia);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    // TOAST-2: create vs update toast, based on whether a familia was being edited.
    toast.success(editing ? "Familia actualizada correctamente" : "Familia creada correctamente");
    setShowForm(false);
    setEditing(null);
    load();
  };

  const columns = [
    { key: "numero", header: "Número", render: (f: Familia) => f.numero },
    { key: "direccion", header: "Dirección", render: (f: Familia) => f.direccion ?? "-" },
    { key: "telefono", header: "Teléfono", render: (f: Familia) => f.telefono ?? "-" },
    {
      key: "actions",
      header: "",
      render: (f: Familia) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => handleEdit(f)}
            className="text-xs text-blue-600 hover:underline"
          >
            Editar
          </button>
          <button
            onClick={() => handleDelete(f)}
            className="text-xs text-red-600 hover:underline"
            data-testid="delete-btn"
          >
            Eliminar
          </button>
        </div>
      ),
    },
  ];

  if (loading) {
    return <div>Cargando familias...</div>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Familias</h2>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="rounded bg-orange-brand px-3 py-1.5 text-sm text-white hover:bg-orange-brand-light"
        >
          Nueva Familia
        </button>
      </div>

      {/* MEMBER-MGMT-2: ?search= filter */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por dirección, teléfono o número..."
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>

      {showForm && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-surface-muted-dark">
          <h3 className="mb-3 text-lg font-semibold">{editing ? "Editar Familia" : "Nueva Familia"}</h3>
          <FamiliaForm familia={editing ?? undefined} onSuccess={handleFormSuccess} />
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
        rows={familias}
        getRowKey={(f) => f.id}
        emptyMessage="Sin datos"
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar familia"
        message={`¿Estás seguro de eliminar la familia ${deleteTarget?.numero ?? ""}?`}
        confirmLabel="Eliminar"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
