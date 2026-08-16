import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Topbar } from "./Topbar";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/miembros", label: "Miembros" },
  { to: "/familias", label: "Familias" },
  { to: "/cabildos", label: "Cabildos" },
  { to: "/capitanas", label: "Capitanas" },
  { to: "/chat", label: "Chat" },
  { to: "/reportes", label: "Reportes" },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-surface-light dark:bg-surface-dark">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-surface-muted-dark">
        <div className="border-b border-gray-200 p-4 dark:border-gray-700">
          <h1 className="text-lg font-bold text-orange-brand">Tatachio Mirabel</h1>
          {user && <p className="text-xs text-gray-500 dark:text-gray-400">{user.nombre}</p>}
        </div>
        <nav className="flex-1 p-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`block rounded px-3 py-2 text-sm transition-colors duration-150 ${
                location.pathname === item.to
                  ? "bg-orange-brand/10 font-medium text-orange-brand"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-gray-200 p-2 dark:border-gray-700">
          <button
            onClick={logout}
            className="w-full rounded px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        <Topbar />

        {/* Page content */}
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
