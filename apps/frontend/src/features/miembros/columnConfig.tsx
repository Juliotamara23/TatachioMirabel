import type { MemberInput } from "@tatachio/shared";
import type { Miembro } from "../../lib/api/miembros";
import { Badge, estadoBadgeTone } from "../../components/Badge";

/**
 * Catalog column descriptor for the members table (COLS-2 full catalog).
 * `editable`/`editor` are consumed by the inline edit flow (T6); the column
 * picker and the Table only need key/header/render/width.
 */
export interface MiembroColumn {
  key: string;
  header: string;
  render: (row: Miembro) => React.ReactNode;
  width?: string; // CSS width, default "minmax(140px, 1fr)"
  editable?: boolean;
  editor?: (
    row: Miembro,
    draft: Partial<MemberInput>,
    onChange: (patch: Partial<MemberInput>) => void,
  ) => React.ReactNode;
}

/**
 * The acciones column renders plain buttons that bubble up to the page, which
 * owns a single delegated click handler on the table container. Keeping the
 * catalog module-level means the buttons cannot close over page handlers, so
 * the page resolves the target member from the button's data attributes.
 */
export function renderAcciones(row: Miembro) {
  return (
    <div className="flex gap-2" data-miembro-id={row.id}>
      <button
        type="button"
        data-action="edit"
        data-miembro-id={row.id}
        className="text-xs text-blue-600 hover:underline dark:text-blue-400"
        data-testid="edit-btn"
      >
        Editar
      </button>
      <button
        type="button"
        data-action="delete"
        data-miembro-id={row.id}
        className="text-xs text-red-600 hover:underline dark:text-red-400"
        data-testid="delete-btn"
      >
        Eliminar
      </button>
    </div>
  );
}

/** Full catalog of every member field (COLS-2). Order defines display order. */
export const MIEMBRO_COLUMNS: MiembroColumn[] = [
  {
    key: "documento",
    header: "Documento",
    render: (m) => `${m.tipoIdentificacion} ${m.numeroDocumento}`,
  },
  { key: "nombres", header: "Nombres", render: (m) => m.nombres, editable: true },
  { key: "apellidos", header: "Apellidos", render: (m) => m.apellidos, editable: true },
  { key: "fechaNacimiento", header: "Fecha Nacimiento", render: (m) => m.fechaNacimiento, editable: true },
  { key: "sexo", header: "Sexo", render: (m) => m.sexo, editable: true },
  { key: "parentesco", header: "Parentesco", render: (m) => m.parentesco, editable: true },
  {
    key: "estado",
    header: "Estado",
    width: "140px",
    render: (m) =>
      m.estado ? <Badge tone={estadoBadgeTone(m.estado)}>{m.estado}</Badge> : "-",
  },
  { key: "estadoCivil", header: "Estado Civil", render: (m) => m.estadoCivil ?? "-", editable: true },
  { key: "profesion", header: "Profesión", render: (m) => m.profesion ?? "-", editable: true },
  { key: "escolaridad", header: "Escolaridad", render: (m) => m.escolaridad ?? "-", editable: true },
  { key: "integrantes", header: "Integrantes", render: (m) => String(m.integrantes), editable: true },
  { key: "direccion", header: "Dirección", render: (m) => m.direccion ?? "-", editable: true },
  { key: "telefono", header: "Teléfono", render: (m) => m.telefono ?? "-", editable: true },
  {
    key: "familia",
    header: "Familia",
    render: (m) => (m.familia?.numero != null ? String(m.familia.numero) : "-"),
  },
  { key: "novedad", header: "Novedad", render: (m) => m.novedad ?? "-", editable: true },
  {
    key: "acciones",
    header: "Acciones",
    width: "100px",
    render: renderAcciones,
  },
];

/** Default visible subset per COLS-1 (exactly 8 columns). */
export const DEFAULT_MIEMBRO_COLUMN_KEYS = [
  "documento",
  "nombres",
  "apellidos",
  "fechaNacimiento",
  "sexo",
  "parentesco",
  "estado",
  "acciones",
] as const;

/** Default column objects derived from the catalog (single source of truth). */
export const DEFAULT_MIEMBRO_COLUMNS: MiembroColumn[] = MIEMBRO_COLUMNS.filter((c) =>
  (DEFAULT_MIEMBRO_COLUMN_KEYS as readonly string[]).includes(c.key),
);
