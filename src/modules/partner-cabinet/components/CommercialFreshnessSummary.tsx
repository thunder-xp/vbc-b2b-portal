import type { WorkspaceHomeDto } from "../services";

export function CommercialFreshnessSummary({ items }: { items: WorkspaceHomeDto["commercialFreshness"] }) {
  const records = items ?? [];
  return <section aria-labelledby="commercial-freshness-title" className="border-y border-zinc-200 bg-white px-4 py-4">
    <h2 className="text-sm font-semibold text-zinc-950" id="commercial-freshness-title">Актуальность коммерческих данных</h2>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {records.map((item) => <div className="flex items-center gap-2 text-xs" key={item.domain}>
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${tone(item.freshness.status)}`} />
        <span className="font-medium text-zinc-700">{item.label}</span>
        <span className="truncate text-zinc-500">{statusLabel(item.freshness.status)}</span>
      </div>)}
    </div>
  </section>;
}

function tone(status: WorkspaceHomeDto["commercialFreshness"][number]["freshness"]["status"]): string {
  if (status === "fresh") return "bg-emerald-500";
  if (status === "aging") return "bg-amber-400";
  return "bg-rose-500";
}

function statusLabel(status: WorkspaceHomeDto["commercialFreshness"][number]["freshness"]["status"]): string {
  if (status === "fresh") return "актуально";
  if (status === "aging") return "требует обновления";
  if (status === "stale") return "устарело";
  return "нет данных";
}
