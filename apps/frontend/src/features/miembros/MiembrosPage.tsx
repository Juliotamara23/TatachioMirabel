import { useEffect, useState, useCallback } from "react";
import { useCabildo } from "../../contexts/CabildoContext";
import { useAuth } from "../../contexts/AuthContext";
import { listMiembros, deleteMiembro, type Miembro } from "../../lib/api/miembros";
import { downloadCenso } from "../../lib/api/reportes";
import { Table } from "../../components/Table";
import { MiembroForm } from "./MiembroForm";

export function MiembrosPage() {
  const { selectedId } = useCabildo();
  const { token } = useAuth();
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Miembro | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const data = await listMiembros({ cabildoId: selectedId });
      setMiembros(data);
    } catch {
      setMiembros([]);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este miembro?")) return;
    try {
      await deleteMiembro(id);
      await load();
    } catch {
      alert("Error al eliminar miembro");
    }
  };

  const handleExport = async () => {
    if (!token) return;
    setExporting(true);
    try {
      await downloadCenso(token);
    } catch {
      alert("Error al exportar");
    } finally {
      setExporting(false);
    }
  };

  const handleEdit = (member: Miembro) => {
    setEditing(member);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditing(null);
    load();
  };

  const columns = [
    { key: "nombre", header: "Nombre", render: (m: Miembro) => `${m.nombres} ${m.apellidos}` },
    { key: "doc", header: "Documento", render: (m: Miembro) => m.numeroDocumento },
    { key: "fecha", header: "F. Nacimiento", render: (m: Miembro) => m.fechaNacimiento },
    { key: "familia", header: "Familia", render: (m: Miembro) => m.familia?.numero ?? "-" },
    {
      key: "actions",
      header: "",
      render: (m: Miembro) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => handleEdit(m)}
            className="text-xs text-blue-600 hover:underline"
            data-testid="edit-btn"
          >
            Editar
          </button>
          <button
            onClick={() => handleDelete(m.id)}
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
    return <div data-testid="miembros-loading">Cargando miembros...</div>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Miembros</h2>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="rounded bg-green-brand px-3 py-1.5 text-sm text-white hover:bg-green-brand-light disabled:opacity-50"
            data-testid="export-btn"
          >
            {exporting ? "Exportando..." : "Exportar Excel"}
          </button>
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="rounded bg-orange-brand px-3 py-1.5 text-sm text-white hover:bg-orange-brand-light"
          >
            Nuevo Miembro
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-surface-muted-dark">
          <h3 className="mb-3 text-lg font-semibold">{editing ? "Editar Miembro" : "Nuevo Miembro"}</h3>
          <MiembroForm member={editing ?? undefined} onSuccess={handleFormSuccess} />
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
        rows={miembros}
        getRowKey={(m) => m.id}
        emptyMessage="Sin datos"
      />
    </div>
  );
}
