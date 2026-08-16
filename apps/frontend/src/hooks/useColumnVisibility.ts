import { useEffect, useState } from "react";

export interface UseColumnVisibilityResult<T extends { key: string }> {
  /** Columns to render, filtered to the visible keys and kept in catalog order. */
  visibleColumns: T[];
  /** Currently visible column keys (persisted shape). */
  visibleKeys: string[];
  toggle: (key: string) => void;
  reset: () => void;
}

/**
 * Reads the stored selection from localStorage (CC-4 namespaced keys),
 * validating every stored key against the catalog. Anything unknown is
 * dropped; if nothing valid is stored the selection falls back to
 * `defaultKeys`. Never throws — corrupt or unavailable storage degrades to
 * the defaults.
 */
function readStoredKeys<T extends { key: string }>(
  catalog: readonly T[],
  storageKey: string,
  defaultKeys: readonly string[],
): string[] {
  const catalogKeys = new Set(catalog.map((c) => c.key));
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [...defaultKeys];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...defaultKeys];
    const valid = [
      ...new Set(
        parsed.filter((k): k is string => typeof k === "string" && catalogKeys.has(k)),
      ),
    ];
    return valid.length > 0 ? valid : [...defaultKeys];
  } catch {
    return [...defaultKeys];
  }
}

/**
 * Column visibility state backed by localStorage (COLS-3 persistence,
 * COLS-4 reset). `defaultKeys` defaults to the whole catalog so callers with
 * a full catalog keep every column unless they opt into a subset.
 */
export function useColumnVisibility<T extends { key: string }>(
  catalog: readonly T[],
  defaultKeys: readonly string[] = catalog.map((c) => c.key),
  storageKey = "tatachio:miembros-columns",
): UseColumnVisibilityResult<T> {
  const [visibleKeys, setVisibleKeys] = useState<string[]>(() =>
    readStoredKeys(catalog, storageKey, defaultKeys),
  );

  // Persist on change; the initial effect re-writes the restored value, which
  // is a no-op and keeps the stored shape canonical.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(visibleKeys));
    } catch {
      // localStorage unavailable (private mode/quota) — state stays in memory
    }
  }, [visibleKeys, storageKey]);

  const toggle = (key: string) => {
    setVisibleKeys((curr) =>
      curr.includes(key) ? curr.filter((k) => k !== key) : [...curr, key],
    );
  };

  const reset = () => {
    setVisibleKeys([...defaultKeys]);
  };

  // Derived during render (rerender-derived-state): visible order follows the
  // catalog, not the stored order, so the table never reorders on toggle.
  const visibleColumns = catalog.filter((c) => visibleKeys.includes(c.key));

  return { visibleColumns, visibleKeys, toggle, reset };
}
