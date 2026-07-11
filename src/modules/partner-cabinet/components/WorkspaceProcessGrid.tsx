import type { WorkspaceProcessCardDto } from "../services";

export function WorkspaceProcessGrid({ cards }: { cards: WorkspaceProcessCardDto[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-zinc-950">Рабочая сводка</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <article className="min-h-36 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm" key={card.key}>
            <h3 className="font-semibold text-zinc-950">{card.title}</h3>
            <div className="mt-4 border-t border-zinc-100 pt-4">
              <p className="text-sm text-zinc-600">{card.emptyMessage}</p>
              <p className="mt-3 text-sm font-medium text-emerald-700">{card.actionLabel}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
