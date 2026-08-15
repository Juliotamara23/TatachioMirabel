interface KpiCardProps {
  label: string;
  value: number | string;
  icon?: string;
  tone?: "default" | "success" | "warning" | "info";
}

const TONE_CLASSES: Record<string, string> = {
  default: "border-gray-200 dark:border-gray-700",
  success: "border-green-brand/30 dark:border-green-brand-light/30",
  warning: "border-orange-brand/30 dark:border-orange-brand-light/30",
  info: "border-blue-400/30 dark:border-blue-300/30",
};

export function KpiCard({ label, value, icon, tone = "default" }: KpiCardProps) {
  return (
    <div
      data-testid="kpi-card"
      className={`rounded-lg border bg-white p-4 shadow-sm dark:bg-surface-muted-dark ${TONE_CLASSES[tone]}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
        {icon && <span className="text-xl" aria-hidden="true">{icon}</span>}
      </div>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100" data-testid="kpi-value">
        {value}
      </p>
    </div>
  );
}
