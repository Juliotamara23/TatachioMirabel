import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { CabildoProvider } from "./contexts/CabildoContext";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <CabildoProvider>
          <App />
        </CabildoProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
