import { useState } from "react";

interface ColumnPickerProps<T extends { key: string; header: string }> {
  /** Full catalog offered to the user (COLS-2). */
  columns: readonly T[];
  /** Keys currently visible; the rest are offered unchecked. */
  visibleKeys: readonly string[];
  onToggle: (key: string) => void;
  onReset: () => void;
  /** Keys that cannot be unchecked (e.g. acciones, always visible). */
  lockedKeys?: readonly string[];
}

/**
 * Gear dropdown that toggles which table columns are visible and restores the
 * default selection (COLS-1..4). The component stays generic over any column
 * catalog; persistence lives in useColumnVisibility.
 */
export function ColumnPicker<T extends { key: string; header: string }>({
  columns,
  visibleKeys,
  onToggle,
  onReset,
  lockedKeys = [],
}: ColumnPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const visible = new Set(visibleKeys);
  const locked = new Set(lockedKeys);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Seleccionar columnas"
        title="Seleccionar columnas"
        className="rounded border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        data-testid="column-picker"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open ? (
        <div
          className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-surface-muted-dark"
          data-testid="column-picker-menu"
        >
          {columns.map((col) => (
            <label
              key={col.key}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <input
                type="checkbox"
                checked={visible.has(col.key)}
                disabled={locked.has(col.key)}
                onChange={() => onToggle(col.key)}
                className="h-4 w-4 rounded border-gray-300 text-orange-brand accent-orange-brand dark:border-gray-600"
              />
              <span className="truncate">{col.header}</span>
            </label>
          ))}
          <button
            type="button"
            onClick={onReset}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            data-testid="column-picker-reset"
          >
            Restaurar
          </button>
        </div>
      ) : null}
    </div>
  );
}
