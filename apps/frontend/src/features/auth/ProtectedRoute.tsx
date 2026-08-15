import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

/**
 * ProtectedRoute — redirects to /login when not authenticated.
 * Preserves the attempted location in state.from (AUTH-SESSION-2).
 */
export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "boot") {
    return <div className="flex min-h-screen items-center justify-center">Cargando...</div>;
  }

  if (status !== "authed") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

/**
 * AdminRoute — wraps ProtectedRoute + blocks CAPTAIN users with a 403 page.
 */
export function AdminRoute() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "boot") {
    return <div className="flex min-h-screen items-center justify-center">Cargando...</div>;
  }

  if (status !== "authed") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (user?.rol !== "ADMINISTRATOR") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-4xl font-bold text-red-600">403</h1>
        <p className="text-lg">Acceso restringido — solo administradores.</p>
      </div>
    );
  }

  return <Outlet />;
}
