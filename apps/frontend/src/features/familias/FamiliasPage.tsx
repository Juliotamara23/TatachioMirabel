import { useEffect, useState, useCallback } from "react";
import { useCabildo } from "../../contexts/CabildoContext";
import { listFamilias, deleteFamilia, type Familia } from "../../lib/api/familias";
import { Table } from "../../components/Table";
import { FamiliaForm } from "./FamiliaForm";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

export function FamiliasPage() {
  const { selectedId } = useCabildo();
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Familia | null>(null);
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

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta familia?")) return;
    try {
      await deleteFamilia(id);
      await load();
    } catch {
      alert("Error al eliminar familia");
    }
  };

  const handleEdit = (familia: Familia) => {
    setEditing(familia);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
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
            onClick={() => handleDelete(f.id)}
            className="text-xs text-red-600 hover:underline"
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
    </div>
  );
}
