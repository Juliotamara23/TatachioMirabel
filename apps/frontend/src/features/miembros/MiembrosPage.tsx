import { useEffect, useState, useCallback } from "react";
import { useCabildo } from "../../contexts/CabildoContext";
import { useAuth } from "../../contexts/AuthContext";
import { listMiembros, deleteMiembro, type Miembro } from "../../lib/api/miembros";
import { downloadCenso } from "../../lib/api/reportes";
import { Table } from "../../components/Table";
import { ColumnPicker } from "../../components/ColumnPicker";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import {
  MIEMBRO_COLUMNS,
  DEFAULT_MIEMBRO_COLUMN_KEYS,
} from "./columnConfig";
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

  // COLS-1..4: visible subset of the catalog, persisted in localStorage.
  const { visibleColumns, visibleKeys, toggle, reset } = useColumnVisibility(
    MIEMBRO_COLUMNS,
    DEFAULT_MIEMBRO_COLUMN_KEYS,
  );

  // Single delegated handler for the catalog's acciones buttons (edit/delete).
  // The buttons bubble up with data-action + data-miembro-id; the member is
  // resolved here so the module-level catalog stays pure.
  const handleTableAction = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest("[data-action]");
    if (!target) return;
    const action = target.getAttribute("data-action");
    const id = target.getAttribute("data-miembro-id");
    const member = id ? miembros.find((m) => m.id === id) : undefined;
    if (!member) return;
    if (action === "edit") {
      handleEdit(member);
    } else if (action === "delete") {
      void handleDelete(member.id);
    }
  };

  if (loading) {
    return <div data-testid="miembros-loading">Cargando miembros...</div>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Miembros</h2>
        <div className="flex gap-2">
          <ColumnPicker
            columns={MIEMBRO_COLUMNS}
            visibleKeys={visibleKeys}
            onToggle={toggle}
            onReset={reset}
            lockedKeys={["acciones"]}
          />
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

      <div onClick={handleTableAction}>
        <Table
          columns={visibleColumns}
          rows={miembros}
          getRowKey={(m) => m.id}
          emptyMessage="Sin datos"
        />
      </div>
    </div>
  );
}
