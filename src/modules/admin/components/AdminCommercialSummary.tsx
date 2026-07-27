import type { AdminCommercialSummary as Summary } from "../types";

export function AdminCommercialSummaryView({ summary }: { summary: Summary }) {
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(summary.metrics).map(([label, value]) => (
          <article className="border border-zinc-200 bg-white p-4" key={label}>
            <p className="text-xs uppercase text-zinc-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value ?? "—"}</p>
          </article>
        ))}
      </section>
      {summary.records.length ? (
        <div className="overflow-x-auto border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-zinc-50">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Модель</th>
                <th className="px-4 py-3">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {summary.records.map((record) => (
                <tr key={record.id}>
                  <td className="px-4 py-3 font-mono text-xs">{record.primary}</td>
                  <td className="px-4 py-3">{record.secondary}</td>
                  <td className="px-4 py-3">{record.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
