import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute, AdminRoute } from "./features/auth/ProtectedRoute";
import { LoginPage } from "./features/auth/LoginPage";
import { AppShell } from "./components/AppShell";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { MiembrosPage } from "./features/miembros/MiembrosPage";
import { FamiliasPage } from "./features/familias/FamiliasPage";
import { CabildosPage } from "./features/cabildos/CabildosPage";
import { CapitanasPage } from "./features/captains/CapitanasPage";
import { PlaceholderPage } from "./components/PlaceholderPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public route */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected layout */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/miembros" element={<MiembrosPage />} />
            <Route path="/familias" element={<FamiliasPage />} />
            <Route path="/cabildos" element={<CabildosPage />} />
            <Route path="/chat" element={<PlaceholderPage title="Chat" />} />

            {/* Admin-only routes */}
            <Route element={<AdminRoute />}>
              <Route path="/capitanas" element={<CapitanasPage />} />
              <Route path="/reportes" element={<PlaceholderPage title="Reportes" />} />
            </Route>
          </Route>
        </Route>

        {/* Default redirects */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
