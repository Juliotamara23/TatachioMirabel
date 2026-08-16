import { useAuth } from "../../contexts/AuthContext";
import { useCabildo } from "../../contexts/CabildoContext";
import { useToast } from "../../contexts/ToastContext";
import { downloadCenso } from "../../lib/api/reportes";
import { runWithToast } from "../../lib/toast";
import { useState } from "react";

/**
 * ReportesPage — admin-only page for downloading Excel reports.
 * REPORTS-1: Censo download via CensoExportButton.
 */
export function ReportesPage() {
  const { token } = useAuth();
  const { selectedId } = useCabildo();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    if (!token) return;
    setLoading(true);
    // XLSX-4: scope the report to the selected cabildo; toast mirrors the outcome (TOAST-2).
    await runWithToast(toast, downloadCenso(token, selectedId ?? undefined), {
      success: "Censo exportado correctamente",
      error: "Error al descargar el censo",
    });
    setLoading(false);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Reportes</h2>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Descarga reportes oficiales en formato Excel.
      </p>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-surface-dark">
        <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">Censo General</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Descarga el censo completo con todas las pestañas (activos, altas, bajas).
        </p>
        <button
          data-testid="censo-download-btn"
          onClick={handleDownload}
          disabled={loading}
          className="mt-4 rounded bg-green-brand px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? "Descargando..." : "Descargar Censo (.xlsx)"}
        </button>
      </div>
    </div>
  );
}
