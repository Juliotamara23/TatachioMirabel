import { useState } from "react";
import { useToast } from "../../contexts/ToastContext";
import { CapitanasRegisterForm } from "./CapitanasRegisterForm";
import { CapitanasList } from "./CapitanasList";

export function CapitanasPage() {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRegisterSuccess = () => {
    // TOAST-2: fired only after register() resolves (see CapitanasRegisterForm).
    toast.success("Capitana registrada correctamente");
    setRefreshKey((k) => k + 1);
  };

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">Capitanas</h2>

      {/* CAPTAINS-1: Registration form */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-surface-muted-dark">
        <h3 className="mb-3 text-lg font-semibold">Registrar Capitana</h3>
        <CapitanasRegisterForm onSuccess={handleRegisterSuccess} />
      </div>

      {/* CAPTAINS-2: List + unassign */}
      <div>
        <h3 className="mb-3 text-lg font-semibold">Capitanas Registradas</h3>
        <CapitanasList key={refreshKey} />
      </div>
    </div>
  );
}
