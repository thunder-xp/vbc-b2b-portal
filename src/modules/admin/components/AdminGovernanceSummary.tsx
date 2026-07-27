export function AdminGovernanceSummary({
  metrics,
}: {
  metrics: Readonly<Record<string, number>>;
}) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Object.entries(metrics).map(([label, value]) => (
        <article className="border border-zinc-200 bg-white p-5" key={label}>
          <p className="text-xs uppercase text-zinc-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
        </article>
      ))}
    </section>
  );
}
