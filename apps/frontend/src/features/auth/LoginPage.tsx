import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { ApiError } from "../../lib/api/client";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError("Credenciales inválidas. Verifica tu correo y contraseña.");
        } else if (err.status === 403) {
          setError("Contacte al administrador para acceder al sistema.");
        } else {
          setError(err.body.error || "Error al iniciar sesión.");
        }
      } else {
        setError("Error de conexión. Intenta de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-light dark:bg-surface-dark">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-lg dark:bg-surface-muted-dark">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-900 dark:text-gray-100">
          Tatachio Mirabel
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              data-testid="login-email"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-surface-dark dark:text-gray-100"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              data-testid="login-password"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-surface-dark dark:text-gray-100"
            />
          </div>
          {error && (
            <div className="rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400" role="alert">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            data-testid="login-submit"
            className="w-full rounded bg-orange-brand px-4 py-2 text-sm font-medium text-white hover:bg-orange-brand-light disabled:opacity-50"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
