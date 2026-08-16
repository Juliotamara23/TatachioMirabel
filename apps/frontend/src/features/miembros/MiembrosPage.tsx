import { useEffect, useState, useCallback } from "react";
import { useCabildo } from "../../contexts/CabildoContext";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { listMiembros, deleteMiembro, type Miembro } from "../../lib/api/miembros";
import { downloadCenso } from "../../lib/api/reportes";
import { runWithToast } from "../../lib/toast";
import { ApiError } from "../../lib/api/client";
import { Table } from "../../components/Table";
import { ColumnPicker } from "../../components/ColumnPicker";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import {
  MIEMBRO_COLUMNS,
  DEFAULT_MIEMBRO_COLUMN_KEYS,
} from "./columnConfig";
import { MiembroForm } from "./MiembroForm";
import { InlineEditableRow } from "./InlineEditableRow";

export function MiembrosPage() {
  const { selectedId } = useCabildo();
  const { token } = useAuth();
  const { toast } = useToast();
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false); // create-only modal (EDIT-5)
  const [editingId, setEditingId] = useState<string | null>(null); // inline edit row (EDIT-1)
  const [deleteTarget, setDeleteTarget] = useState<Miembro | null>(null); // ConfirmDialog (EDIT-6)
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

  const handleDelete = (member: Miembro) => {
    setDeleteTarget(member);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteMiembro(target.id);
      toast.success("Miembro eliminado correctamente");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.body.error : "Error al eliminar miembro");
    }
  };

  const handleExport = async () => {
    if (!token) return;
    setExporting(true);
    // XLSX-4: scope the report to the selected cabildo; toast mirrors the outcome (TOAST-2).
    await runWithToast(toast, downloadCenso(token, selectedId ?? undefined), {
      success: "Censo exportado correctamente",
      error: "Error al exportar el censo",
    });
    setExporting(false);
  };

  const handleEdit = (member: Miembro) => {
    // EDIT-1: ✏️ switches the row into inline edit mode (no modal).
    setEditingId(member.id);
  };

  const handleInlineSave = useCallback(() => {
    setEditingId(null);
    load();
  }, [load]);

  const handleInlineCancel = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleFormSuccess = () => {
    setShowForm(false);
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
      handleDelete(member);
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
            onClick={() => setShowForm(true)}
            className="rounded bg-orange-brand px-3 py-1.5 text-sm text-white hover:bg-orange-brand-light"
          >
            Nuevo Miembro
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-surface-muted-dark">
          <h3 className="mb-3 text-lg font-semibold">Nuevo Miembro</h3>
          <MiembroForm onSuccess={handleFormSuccess} />
          <button
            onClick={() => setShowForm(false)}
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
          renderRow={(row) =>
            editingId === row.id ? (
              <InlineEditableRow
                row={row}
                columns={visibleColumns}
                onSave={handleInlineSave}
                onCancel={handleInlineCancel}
              />
            ) : null
          }
        />
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar miembro"
        message={`¿Estás seguro de eliminar a ${deleteTarget?.nombres ?? ""} ${deleteTarget?.apellidos ?? ""}?`}
        confirmLabel="Eliminar"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
