import { useEffect, useState } from "react";
import { useCabildo } from "../../contexts/CabildoContext";
import { listMiembros, type Miembro } from "../../lib/api/miembros";
import { listFamilias } from "../../lib/api/familias";
import { listCaptains } from "../../lib/api/admin";
import { ageFromFechaNacimiento, MAX_PLAUSIBLE_AGE_YEARS } from "@tatachio/shared";
import { KpiCard } from "../../components/KpiCard";
import { AlertCard } from "../../components/AlertCard";

interface DashboardData {
  activeMembers: number;
  familiesCount: number;
  cabildosConVigencia: number;
  altas: number;
  bajas: number;
  ageWarnings: Miembro[];
  membersWithoutFamily: Miembro[];
  captainsPerCabildo: number;
}

export function DashboardPage() {
  const { selectedId, list: cabildos } = useCabildo();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [miembros, familias, captains] = await Promise.all([
          listMiembros({ cabildoId: selectedId ?? undefined }),
          listFamilias({ cabildoId: selectedId ?? undefined }),
          listCaptains(selectedId ?? undefined),
        ]);

        if (cancelled) return;

        const activeMembers = miembros.filter((m) => m.estado !== "BAJA").length;
        const altas = miembros.filter((m) => m.estado === "PENDIENTE").length;
        const bajas = miembros.filter((m) => m.estado === "BAJA").length;

        const ageWarnings = miembros.filter((m) => {
          try {
            return ageFromFechaNacimiento(m.fechaNacimiento) > MAX_PLAUSIBLE_AGE_YEARS;
          } catch {
            return false;
          }
        });

        const membersWithoutFamily = miembros.filter(
          (m) => !m.familiaId || (m.familia && !m.familia.numero),
        );

        const cabildosConVigencia = cabildos.filter(
          (c) => c.vigencia >= new Date().getFullYear(),
        ).length;

        setData({
          activeMembers,
          familiesCount: familias.length,
          cabildosConVigencia,
          altas,
          bajas,
          ageWarnings,
          membersWithoutFamily,
          captainsPerCabildo: captains.length,
        });
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedId, cabildos]);

  if (loading) {
    return <div data-testid="dashboard-loading">Cargando dashboard...</div>;
  }

  if (!selectedId) {
    return (
      <div className="text-gray-500 dark:text-gray-400">
        Selecciona un cabildo para ver el dashboard.
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-red-500">
        Error al cargar los datos del dashboard.
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h2>

      {/* T9: KPI Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Miembros Activos" value={data.activeMembers} icon="👤" tone="success" />
        <KpiCard label="Familias" value={data.familiesCount} icon="👨‍👩‍👧‍👦" tone="info" />
        <KpiCard label="Cabildos con Vigencia" value={data.cabildosConVigencia} icon="🏛️" />
        <KpiCard
          label="Altas / Bajas (año)"
          value={`${data.altas} / ${data.bajas}`}
          icon="📊"
          tone="warning"
        />
      </div>

      {/* T10: Alert Cards */}
      <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-200">Alertas</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AlertCard
          title={`Edad > ${MAX_PLAUSIBLE_AGE_YEARS} años`}
          count={data.ageWarnings.length}
          tone="danger"
          items={data.ageWarnings.map(
            (m) => `${m.nombres} ${m.apellidos} (${ageFromFechaNacimiento(m.fechaNacimiento)} años)`,
          )}
        />
        <AlertCard
          title="Miembros sin familia"
          count={data.membersWithoutFamily.length}
          tone="warning"
          items={data.membersWithoutFamily.map(
            (m) => `${m.nombres} ${m.apellidos}`,
          )}
        />
        <AlertCard
          title="Capitanas en cabildo"
          count={data.captainsPerCabildo}
          tone={data.captainsPerCabildo <= 1 ? "danger" : "info"}
        />
      </div>
    </div>
  );
}
