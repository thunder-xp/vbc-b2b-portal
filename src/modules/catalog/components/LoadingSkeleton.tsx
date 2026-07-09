export function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-10 w-64 animate-pulse rounded-md bg-zinc-200" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            className="h-80 animate-pulse rounded-lg border border-zinc-200 bg-white"
            key={index}
          />
        ))}
      </div>
    </div>
  );
}
