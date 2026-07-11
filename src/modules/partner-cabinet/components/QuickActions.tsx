import Link from "next/link";

import type { PartnerWorkspaceModule } from "../services";

export function QuickActions({ modules }: { modules: PartnerWorkspaceModule[] }) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-zinc-950">Рабочие модули</h2>
        <p className="mt-1 text-sm text-zinc-600">Быстрый доступ к ежедневным операциям компании.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {modules.map((module) => module.href && module.availability === "available" ? (
          <Link className="min-h-32 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow" href={module.href} key={module.key}>
            <h3 className="font-semibold text-zinc-950">{module.title}</h3>
            <p className="mt-2 text-sm leading-5 text-zinc-600">{module.description}</p>
            <p className="mt-4 text-xs font-semibold uppercase text-emerald-700">Доступно</p>
          </Link>
        ) : (
          <article className="min-h-32 rounded-lg border border-dashed border-zinc-300 bg-zinc-100 p-5" key={module.key}>
            <h3 className="font-semibold text-zinc-700">{module.title}</h3>
            <p className="mt-2 text-sm leading-5 text-zinc-500">{module.description}</p>
            <p className="mt-4 text-xs font-semibold uppercase text-zinc-500">{module.availability === "configuration_required" ? "Требуется настройка" : "Скоро"}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
