import { useAuth } from "../contexts/AuthContext";
import { useCabildo } from "../contexts/CabildoContext";
import { useTheme } from "../contexts/ThemeContext";

/** First letters of the first two name words, uppercased ("Ana Pérez" → "AP"). */
function initialsOf(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Topbar — cabildo selector dropdown, search input (future), dark mode toggle,
 * user avatar chip (VIS-2). APP-SHELL-3: dropdown change updates CabildoContext + localStorage.
 */
export function Topbar() {
  const { user } = useAuth();
  const { list, selectedId, select } = useCabildo();
  const { theme, toggle } = useTheme();

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3 dark:border-gray-700 dark:bg-surface-muted-dark">
      {/* Cabildo selector */}
      <div className="flex items-center gap-3">
        <label htmlFor="cabildo-selector" className="text-sm font-medium text-gray-600 dark:text-gray-400">
          Cabildo:
        </label>
        <select
          id="cabildo-selector"
          data-testid="cabildo-selector"
          value={selectedId ?? ""}
          onChange={(e) => select(e.target.value)}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-orange-brand focus:outline-none focus:ring-1 focus:ring-orange-brand dark:border-gray-600 dark:bg-surface-dark dark:text-gray-200"
        >
          {list.length === 0 && <option value="">Sin cabildos</option>}
          {list.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Right side: theme toggle + user avatar chip */}
      <div className="flex items-center gap-4">
        <button
          onClick={toggle}
          data-testid="theme-toggle"
          className="rounded p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          aria-label="Cambiar tema"
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>

        {user && (
          <div className="flex items-center gap-2.5" data-testid="topbar-user">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-brand text-sm font-semibold text-white"
              data-testid="topbar-avatar"
              aria-hidden="true"
            >
              {initialsOf(user.nombre)}
            </span>
            <span className="hidden text-sm font-medium text-gray-700 sm:inline dark:text-gray-200">
              {user.nombre}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
