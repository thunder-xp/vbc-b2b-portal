import type { WorkspaceProcessCardDto } from "../services";
import Link from "next/link";

export function WorkspaceProcessGrid({ cards }: { cards: WorkspaceProcessCardDto[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-zinc-950">Рабочая сводка</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <article className={`min-h-36 rounded-lg border bg-white p-5 shadow-sm ${card.status === "warning" ? "border-amber-300" : "border-zinc-200"}`} key={card.key}>
            <h3 className="font-semibold text-zinc-950">{card.title}</h3>
            <div className="mt-4 border-t border-zinc-100 pt-4">
              <p className="text-sm text-zinc-600">{card.summary}</p>
              <Link className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700" href={card.href} prefetch={false}>{card.actionLabel}</Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
