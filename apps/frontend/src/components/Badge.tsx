/**
 * Colored pill badge (BADGE-1/2). Tones follow the design tokens:
 * success = green, warning = amber, danger = red, each with light/dark
 * variants.
 */

const TONE_CLASSES = {
  success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  danger: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
} as const;

export type BadgeTone = keyof typeof TONE_CLASSES;

interface BadgeProps {
  tone: BadgeTone;
  children: React.ReactNode;
}

export function Badge({ tone, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

const ESTADO_TONE: Record<string, BadgeTone> = {
  ACTIVO: "success",
  PENDIENTE: "warning",
  BAJA: "danger",
};

/** Maps a member estado string to the badge tone (ACTIVO→success, PENDIENTE→warning, BAJA→danger). */
export function estadoBadgeTone(estado: string): BadgeTone {
  return ESTADO_TONE[estado] ?? "warning";
}
