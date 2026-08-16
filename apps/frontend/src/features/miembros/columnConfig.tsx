import type { MemberInput } from "@tatachio/shared";
import type { Miembro } from "../../lib/api/miembros";
import { Badge, estadoBadgeTone } from "../../components/Badge";
import { SEXO_OPTIONS, PARENTESCO_OPTIONS } from "./MiembroForm";

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

/** Shared compact input classes so edit-mode cells fit the 44px row height. */
const INPUT_CLASS =
  "h-7 w-full rounded border border-gray-300 px-2 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100";

/** Options for enum selects not rendered by MiembroForm (inline-only fields). */
const ESTADO_CIVIL_OPTIONS = ["S", "C"] as const;
const ESCOLARIDAD_OPTIONS = ["PR", "SE", "UN", "NI"] as const;

/**
 * Editor factories — each returns a MiembroColumn["editor"] bound to one
 * MemberInput field. InlineEditableRow calls `col.editor(row, draft, onChange)`
 * with the current draft, so the factories stay pure and module-level.
 */
function textEditor(field: keyof MemberInput, placeholder?: string): MiembroColumn["editor"] {
  return (_row, draft, onChange) => (
    <input
      type="text"
      value={String(draft[field] ?? "")}
      placeholder={placeholder}
      onChange={(e) => onChange({ [field]: e.target.value } as Partial<MemberInput>)}
      className={INPUT_CLASS}
    />
  );
}

function numberEditor(field: keyof MemberInput): MiembroColumn["editor"] {
  return (_row, draft, onChange) => {
    const value = draft[field];
    return (
      <input
        type="number"
        min={1}
        value={typeof value === "number" && Number.isFinite(value) ? value : ""}
        onChange={(e) => {
          const parsed = parseInt(e.target.value, 10);
          onChange({ [field]: Number.isNaN(parsed) ? undefined : parsed } as Partial<MemberInput>);
        }}
        className={INPUT_CLASS}
      />
    );
  };
}

function selectEditor(
  field: keyof MemberInput,
  options: readonly string[],
  emptyLabel?: string,
): MiembroColumn["editor"] {
  return (_row, draft, onChange) => (
    <select
      value={String(draft[field] ?? "")}
      onChange={(e) => {
        const value = e.target.value;
        onChange({ [field]: value === "" ? undefined : value } as Partial<MemberInput>);
      }}
      className={INPUT_CLASS}
    >
      {emptyLabel ? <option value="">{emptyLabel}</option> : null}
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

/** Full catalog of every member field (COLS-2). Order defines display order. */
export const MIEMBRO_COLUMNS: MiembroColumn[] = [
  {
    key: "documento",
    header: "Documento",
    render: (m) => `${m.tipoIdentificacion} ${m.numeroDocumento}`,
  },
  { key: "nombres", header: "Nombres", render: (m) => m.nombres, editable: true, editor: textEditor("nombres") },
  { key: "apellidos", header: "Apellidos", render: (m) => m.apellidos, editable: true, editor: textEditor("apellidos") },
  { key: "fechaNacimiento", header: "Fecha Nacimiento", render: (m) => m.fechaNacimiento, editable: true, editor: textEditor("fechaNacimiento", "DD/MM/YYYY") },
  { key: "sexo", header: "Sexo", render: (m) => m.sexo, editable: true, editor: selectEditor("sexo", SEXO_OPTIONS) },
  { key: "parentesco", header: "Parentesco", render: (m) => m.parentesco, editable: true, editor: selectEditor("parentesco", PARENTESCO_OPTIONS) },
  {
    key: "estado",
    header: "Estado",
    width: "140px",
    render: (m) =>
      m.estado ? <Badge tone={estadoBadgeTone(m.estado)}>{m.estado}</Badge> : "-",
  },
  { key: "estadoCivil", header: "Estado Civil", render: (m) => m.estadoCivil ?? "-", editable: true, editor: selectEditor("estadoCivil", ESTADO_CIVIL_OPTIONS, "—") },
  { key: "profesion", header: "Profesión", render: (m) => m.profesion ?? "-", editable: true, editor: textEditor("profesion") },
  { key: "escolaridad", header: "Escolaridad", render: (m) => m.escolaridad ?? "-", editable: true, editor: selectEditor("escolaridad", ESCOLARIDAD_OPTIONS, "—") },
  { key: "integrantes", header: "Integrantes", render: (m) => String(m.integrantes), editable: true, editor: numberEditor("integrantes") },
  { key: "direccion", header: "Dirección", render: (m) => m.direccion ?? "-", editable: true, editor: textEditor("direccion") },
  { key: "telefono", header: "Teléfono", render: (m) => m.telefono ?? "-", editable: true, editor: textEditor("telefono") },
  {
    key: "familia",
    header: "Familia",
    render: (m) => (m.familia?.numero != null ? String(m.familia.numero) : "-"),
  },
  { key: "novedad", header: "Novedad", render: (m) => m.novedad ?? "-", editable: true, editor: textEditor("novedad") },
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
