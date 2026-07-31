export default function OnboardingLoading() {
  return (
    <div
      className="mx-auto max-w-7xl animate-pulse space-y-6"
      role="status"
      aria-live="polite"
      aria-label="Загрузка онбординга"
    >
      <div className="h-24 rounded bg-zinc-100" />
      <div className="h-28 rounded border border-zinc-200 bg-white" />
      <div className="h-72 border-y border-zinc-200 bg-white" />
      <span className="sr-only">Загрузка...</span>
    </div>
  );
}
