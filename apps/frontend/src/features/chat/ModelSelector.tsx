import { useAuth } from "../../contexts/AuthContext";

interface ModelSelectorProps {
  models: string[];
  selectedModel: string;
  onSelect: (model: string) => void;
}

/**
 * ModelSelector — dropdown for LLM model selection.
 * AI-CHAT-2: visible for ADMINISTRATOR, hidden for CAPTAIN.
 */
export function ModelSelector({ models, selectedModel, onSelect }: ModelSelectorProps) {
  const { user } = useAuth();

  // CAPTAIN users don't see the model selector
  if (user?.rol !== "ADMINISTRATOR") {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="model-selector" className="text-sm text-gray-500 dark:text-gray-400">
        Modelo:
      </label>
      <select
        id="model-selector"
        data-testid="model-selector"
        value={selectedModel}
        onChange={(e) => onSelect(e.target.value)}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:border-orange-brand focus:outline-none dark:border-gray-600 dark:bg-surface-dark dark:text-gray-200"
      >
        {models.length === 0 && <option value="">Sin modelos</option>}
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
