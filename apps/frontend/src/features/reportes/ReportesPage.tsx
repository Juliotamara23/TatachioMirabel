import { useAuth } from "../../contexts/AuthContext";
import { downloadCenso } from "../../lib/api/reportes";
import { useState } from "react";

/**
 * ReportesPage — admin-only page for downloading Excel reports.
 * REPORTS-1: Censo download via CensoExportButton.
 */
export function ReportesPage() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      await downloadCenso(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al descargar el censo");
    } finally {
      setLoading(false);
    }
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

      {error && (
        <div className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
