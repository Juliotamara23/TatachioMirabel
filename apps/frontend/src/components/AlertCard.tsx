import type { ReactNode } from "react";

interface AlertCardProps {
  title: string;
  count: number;
  items?: string[];
  tone?: "warning" | "danger" | "info";
  /** Optional leading icon rendered inside the tone indicator. */
  icon?: ReactNode;
}

/** Tone → dot color + soft icon wash. */
const TONE_CLASSES: Record<string, { dot: string; icon: string }> = {
  warning: {
    dot: "bg-orange-brand dark:bg-orange-brand-light",
    icon: "text-orange-brand dark:text-orange-brand-light",
  },
  danger: {
    dot: "bg-red-500 dark:bg-red-400",
    icon: "text-red-500 dark:text-red-400",
  },
  info: {
    dot: "bg-blue-500 dark:bg-blue-400",
    icon: "text-blue-500 dark:text-blue-400",
  },
};

/**
 * AlertCard — reminders-list style row: tone dot + icon + title + count,
 * with the affected members listed underneath.
 */
export function AlertCard({ title, count, items, tone = "warning", icon }: AlertCardProps) {
  const tones = TONE_CLASSES[tone] ?? TONE_CLASSES.warning;

  return (
    <div
      data-testid="alert-card"
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-surface-muted-dark"
    >
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tones.dot}`} data-testid="alert-tone" />
        {icon && (
          <span className={`shrink-0 ${tones.icon}`} aria-hidden="true">
            {icon}
          </span>
        )}
        <h4 className="flex-1 truncate text-sm font-semibold text-gray-800 dark:text-gray-200">
          {title}
        </h4>
        <span
          className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-300"
          data-testid="alert-count"
        >
          {count}
        </span>
      </div>
      {count > 0 && items && items.length > 0 && (
        <ul className="mt-3 max-h-32 space-y-1.5 overflow-y-auto border-t border-gray-100 pt-2 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-400">
          {items.slice(0, 10).map((item, i) => (
            <li key={i} className="flex items-center gap-2" data-testid="alert-item">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tones.dot}`} aria-hidden="true" />
              <span className="truncate">{item}</span>
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
