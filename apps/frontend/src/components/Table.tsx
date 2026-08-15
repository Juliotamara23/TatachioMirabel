import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
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

export function Table<T>({
  columns,
  rows,
  rowHeight = 40,
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
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-surface-muted-dark">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="border-b border-gray-200 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
      </table>
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
            <tr
              key={getRowKey ? getRowKey(row) : virtualRow.index}
              data-testid="table-row"
              className={`absolute flex w-full items-center border-b border-gray-100 dark:border-gray-800 ${
                onRowClick ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" : ""
              }`}
              style={{
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className="flex-1 truncate px-4 py-1 text-sm text-gray-700 dark:text-gray-300"
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          );
        })}
      </div>
    </div>
  );
}
