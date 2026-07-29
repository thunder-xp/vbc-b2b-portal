import type { ReactNode } from "react";

export function PageHeader({
  actions,
  breadcrumbs,
  description,
  eyebrow,
  filters,
  status,
  title,
}: {
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  filters?: ReactNode;
  status?: ReactNode;
  title: ReactNode;
}) {
  return (
    <header className="border-b border-zinc-200 pb-5">
      {breadcrumbs ? <nav aria-label="Хлебные крошки" className="mb-3 text-sm text-zinc-600">{breadcrumbs}</nav> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="text-xs font-semibold uppercase text-emerald-700">{eyebrow}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className={eyebrow ? "mt-2 text-2xl font-semibold text-zinc-950" : "text-2xl font-semibold text-zinc-950"}>{title}</h1>
            {status ? <div className={eyebrow ? "mt-2" : ""}>{status}</div> : null}
          </div>
          {description ? <p className="mt-1 max-w-3xl text-sm text-zinc-600">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {filters ? <div className="mt-4">{filters}</div> : null}
    </header>
  );
}
