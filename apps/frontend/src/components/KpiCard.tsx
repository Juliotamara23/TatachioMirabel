import type { ReactNode } from "react";

interface KpiCardProps {
  label: string;
  value: number | string;
  icon?: ReactNode;
  tone?: "green" | "orange" | "blue" | "amber";
}

/** Tone → card border + colored icon chip (light 100/600, dark 500/10 + 400). */
const TONE_CLASSES: Record<string, { card: string; chip: string }> = {
  green: {
    card: "border-green-brand/20",
    chip: "bg-green-brand/10 text-green-brand dark:bg-green-brand-light/10 dark:text-green-brand-light",
  },
  orange: {
    card: "border-orange-brand/20",
    chip: "bg-orange-brand/10 text-orange-brand dark:bg-orange-brand-light/10 dark:text-orange-brand-light",
  },
  blue: {
    card: "border-blue-400/20",
    chip: "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  },
  amber: {
    card: "border-amber-400/20",
    chip: "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  },
};

export function KpiCard({ label, value, icon, tone = "green" }: KpiCardProps) {
  const tones = TONE_CLASSES[tone] ?? TONE_CLASSES.green;

  return (
    <div
      data-testid="kpi-card"
      className={`rounded-lg border bg-white p-4 shadow-sm dark:bg-surface-muted-dark ${tones.card}`}
    >
      <div className="flex items-center gap-4">
        {icon && (
          <span
            data-testid="kpi-icon"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${tones.chip}`}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
          <p
            className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100"
            data-testid="kpi-value"
          >
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
