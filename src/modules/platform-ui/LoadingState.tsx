export function LoadingState({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div aria-busy="true" aria-label={label} className="space-y-5" role="status">
      <span className="sr-only">{label}</span>
      <div className="h-16 max-w-md bg-zinc-200 motion-safe:animate-pulse" />
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, index) => <div className="h-20 border border-zinc-200 bg-white motion-safe:animate-pulse" key={index} />)}
      </div>
    </div>
  );
}
