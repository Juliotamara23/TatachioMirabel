import { useCabildo } from "../contexts/CabildoContext";
import { useTheme } from "../contexts/ThemeContext";

/**
 * Topbar — cabildo selector dropdown, search input (future), dark mode toggle.
 * APP-SHELL-3: dropdown change updates CabildoContext + localStorage.
 */
export function Topbar() {
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

      {/* Right side: theme toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          data-testid="theme-toggle"
          className="rounded p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          aria-label="Cambiar tema"
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </div>
    </header>
  );
}
