export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h2>
      <p className="mt-2 text-gray-500 dark:text-gray-400">Esta sección estará disponible en PR 2.</p>
    </div>
  );
}
