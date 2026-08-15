interface AlertCardProps {
  title: string;
  count: number;
  items?: string[];
  tone?: "warning" | "danger" | "info";
}

const TONE_CLASSES: Record<string, string> = {
  warning: "border-orange-brand/50 bg-orange-50 dark:bg-orange-950/30",
  danger: "border-red-400/50 bg-red-50 dark:bg-red-950/30",
  info: "border-blue-400/50 bg-blue-50 dark:bg-blue-950/30",
};

export function AlertCard({ title, count, items, tone = "warning" }: AlertCardProps) {
  return (
    <div
      data-testid="alert-card"
      className={`rounded-lg border p-4 ${TONE_CLASSES[tone]}`}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</h4>
        <span
          className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-300"
          data-testid="alert-count"
        >
          {count}
        </span>
      </div>
      {count > 0 && items && items.length > 0 && (
        <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-gray-600 dark:text-gray-400">
          {items.slice(0, 10).map((item, i) => (
            <li key={i} className="truncate" data-testid="alert-item">
              {item}
            </li>
          ))}
          {items.length > 10 && (
            <li className="italic text-gray-400">+{items.length - 10} más...</li>
          )}
        </ul>
      )}
    </div>
  );
}
