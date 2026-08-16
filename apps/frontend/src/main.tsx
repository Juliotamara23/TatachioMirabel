import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { CabildoProvider } from "./contexts/CabildoContext";
import { ToastProvider } from "./contexts/ToastContext";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <CabildoProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </CabildoProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
