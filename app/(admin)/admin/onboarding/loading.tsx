export default function OnboardingLoading() {
  return (
    <div
      className="mx-auto max-w-7xl animate-pulse space-y-6"
      role="status"
      aria-live="polite"
      aria-label="Загрузка онбординга"
    >
      <div className="space-y-3 border-b border-zinc-200 pb-5">
        <div className="h-4 w-44 rounded bg-zinc-200" />
        <div className="h-8 w-72 max-w-full rounded bg-zinc-200" />
        <div className="h-4 w-full max-w-2xl rounded bg-zinc-100" />
      </div>
      <div className="grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 bg-white p-4">
            <div className="h-7 w-16 rounded bg-zinc-200" />
            <div className="mt-3 h-4 w-28 rounded bg-zinc-100" />
          </div>
        ))}
      </div>
      <div className="space-y-px overflow-hidden border-y border-zinc-200 bg-zinc-200">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 bg-white p-4">
            <div className="h-5 w-56 max-w-full rounded bg-zinc-200" />
            <div className="mt-3 h-4 w-80 max-w-full rounded bg-zinc-100" />
          </div>
        ))}
      </div>
      <span className="sr-only">Загрузка...</span>
    </div>
  );
}
