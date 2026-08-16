import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  width?: string; // CSS width, default "minmax(140px, 1fr)"
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowHeight?: number;
  overscan?: number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  getRowKey?: (row: T) => string;
}

/**
 * Grid-based virtualized table. The header and every virtual row share the
 * exact same `gridTemplateColumns` string, so columns always align at every
 * scroll position (TABLE-ALIGN-1). Only ~visible rows exist in the DOM
 * (TABLE-ALIGN-2) and the component stays generic for any column set
 * (TABLE-ALIGN-3).
 */
export function Table<T>({
  columns,
  rows,
  rowHeight = 44,
  overscan = 10,
  onRowClick,
  emptyMessage = "Sin datos",
  getRowKey,
}: TableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  // One source of truth for column widths — shared by header and rows.
  const gridTemplate = columns.map((c) => c.width ?? "minmax(140px, 1fr)").join(" ");

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white p-8 text-gray-500 dark:border-gray-700 dark:bg-surface-muted-dark dark:text-gray-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="overflow-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-surface-muted-dark"
      style={{ maxHeight: 600 }}
      data-testid="virtual-table"
    >
      {/* Header — sticky inside the scroll container, same grid as rows */}
      <div
        className="sticky top-0 z-10 grid border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-surface-muted-dark"
        style={{ gridTemplateColumns: gridTemplate }}
        data-testid="table-header"
      >
        {columns.map((col) => (
          <div
            key={col.key}
            className="truncate px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            {col.header}
          </div>
        ))}
      </div>
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <div
              key={getRowKey ? getRowKey(row) : virtualRow.index}
              data-testid="table-row"
              className={`absolute grid w-full items-center border-b border-gray-100 dark:border-gray-800 ${
                onRowClick ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" : ""
              }`}
              style={{
                gridTemplateColumns: gridTemplate,
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <div
                  key={col.key}
                  className="truncate px-4 py-1 text-sm text-gray-700 dark:text-gray-300"
                >
                  {col.render(row)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
