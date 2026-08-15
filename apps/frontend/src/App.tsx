import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute, AdminRoute } from "./features/auth/ProtectedRoute";
import { LoginPage } from "./features/auth/LoginPage";
import { AppShell } from "./components/AppShell";
import { DashboardPage } from "./features/dashboard/DashboardPage";
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
            <Route path="/miembros" element={<PlaceholderPage title="Miembros" />} />
            <Route path="/familias" element={<PlaceholderPage title="Familias" />} />
            <Route path="/cabildos" element={<PlaceholderPage title="Cabildos" />} />
            <Route path="/chat" element={<PlaceholderPage title="Chat" />} />

            {/* Admin-only routes */}
            <Route element={<AdminRoute />}>
              <Route path="/capitanas" element={<PlaceholderPage title="Capitanas" />} />
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
