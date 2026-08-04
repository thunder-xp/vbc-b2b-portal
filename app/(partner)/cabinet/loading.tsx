export default function CabinetLoading() {
  return (
    <div aria-label="Загрузка раздела" className="space-y-5" role="status">
      <div className="h-7 w-56 animate-pulse rounded bg-zinc-200" />
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div className="h-28 animate-pulse rounded-md border border-zinc-200 bg-zinc-50" key={item} />
        ))}
      </div>
      <span className="sr-only">Раздел загружается</span>
    </div>
  );
}
