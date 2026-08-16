import type { SVGProps } from "react";

/**
 * Tiny inline SVG icon set (feather-style strokes, 24x24, currentColor).
 * No icon dependency: these are the only icons the dashboard/topbar need.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Users — Miembros KPI. */
export function UsersIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Base>
  );
}

/** Home — Familias KPI. */
export function HomeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </Base>
  );
}

/** Building/landmark — Cabildos KPI. */
export function BuildingIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M9 21v-3h6v3" />
      <path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01" />
    </Base>
  );
}

/** Up/down arrows — Altas/Bajas KPI. */
export function ArrowsUpDownIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M7 16V4M7 4L3 8M7 4l4 4" />
      <path d="M17 8v12M17 20l-4-4M17 20l4-4" />
    </Base>
  );
}

/** Alert triangle — danger alert. */
export function AlertTriangleIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Base>
  );
}

/** Bell — warning alert. */
export function BellIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Base>
  );
}

/** Info circle — info alert. */
export function InfoIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </Base>
  );
}
