import { useState } from "react";
import { memberSchema, type MemberInput } from "@tatachio/shared";
import { updateMiembro, type Miembro } from "../../lib/api/miembros";
import { useToast } from "../../contexts/ToastContext";
import { runWithToast } from "../../lib/toast";
import { memberToDefaults } from "./MiembroForm";
import type { MiembroColumn } from "./columnConfig";

interface InlineEditableRowProps {
  row: Miembro;
  columns: MiembroColumn[];
  onSave: () => void;
  onCancel: () => void;
}

/**
 * Returns only the MemberInput fields whose draft value differs from the row.
 * The backend PUT validates with memberSchema.partial() and Prisma updates only
 * the provided fields, so the payload can be a sparse changed-fields object.
 */
function changedFieldsOnly(draft: MemberInput, row: Miembro): Partial<MemberInput> {
  const changed: Partial<MemberInput> = {};
  (Object.keys(draft) as (keyof MemberInput)[]).forEach((key) => {
    if (draft[key] !== (row[key] ?? undefined)) {
      // Computed-key assignment into a mapped type needs the record view.
      (changed as Record<string, unknown>)[key] = draft[key];
    }
  });
  return changed;
}

/**
 * Excel-style row editing (EDIT-1..7). Rendered by MiembrosPage inside the
 * Table's grid row (via renderRow) when editingId === row.id; the returned
 * fragment's cell divs flow into the row's shared gridTemplateColumns, so
 * column alignment and virtualization are preserved (EDIT-7).
 */
export function InlineEditableRow({ row, columns, onSave, onCancel }: InlineEditableRowProps) {
  const { toast } = useToast();
  // Draft starts from the row's editable values (same mapping as MiembroForm).
  // Hidden columns are simply not rendered, so their fields stay untouched.
  const [draft, setDraft] = useState<MemberInput>(() => memberToDefaults(row));
  const [saving, setSaving] = useState(false);

  const applyPatch = (patch: Partial<MemberInput>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  // Per-field validation against the full member schema on every change (EDIT-2).
  const result = memberSchema.safeParse({ ...row, ...draft });
  const fieldErrors: Record<string, string> = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (field && fieldErrors[field] === undefined) {
        fieldErrors[field] = issue.message;
      }
    }
  }

  const handleSave = async () => {
    if (!result.success || saving) return;
    setSaving(true);
    // EDIT-3: send only changed fields; success toast; onSave() → page refetches
    // and exits edit mode. runWithToast resolves the updated member on success.
    const saved = await runWithToast(toast, updateMiembro(row.id, changedFieldsOnly(draft, row)), {
      success: "Miembro actualizado correctamente",
      error: "Error al actualizar miembro",
    });
    setSaving(false);
    if (saved) onSave();
  };

  return (
    <>
      {columns.map((col) => {
        // The acciones cell swaps the row actions for Guardar/Cancelar (EDIT-1).
        if (col.key === "acciones") {
          return (
            <div key={col.key} className="flex items-center gap-1 px-2 py-0.5">
              <button
                type="button"
                data-testid="save-btn"
                onClick={() => void handleSave()}
                disabled={!result.success || saving}
                className="rounded bg-green-brand px-2 py-1 text-xs text-white hover:bg-green-brand-light disabled:opacity-50"
              >
                Guardar
              </button>
              <button
                type="button"
                data-testid="cancel-btn"
                onClick={onCancel}
                disabled={saving}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
            </div>
          );
        }

        return (
          <div key={col.key} className="px-2 py-0.5">
            {col.editor ? (
              <>
                {col.editor(row, draft, applyPatch)}
                {fieldErrors[col.key] ? (
                  <p className="text-xs text-red-500">{fieldErrors[col.key]}</p>
                ) : null}
              </>
            ) : (
              <div className="truncate text-sm text-gray-700 dark:text-gray-300">{col.render(row)}</div>
            )}
          </div>
        );
      })}
    </>
  );
}
