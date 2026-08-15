import type { ReactNode } from "react";

type CatalogProductCardFrameProps = {
  actions: ReactNode;
  availability: ReactNode;
  commercial: ReactNode;
  context?: ReactNode;
  media: ReactNode;
  metadata: ReactNode;
  secondaryActions?: ReactNode;
  title: ReactNode;
};

export function CatalogProductCardFrame({
  actions,
  availability,
  commercial,
  context,
  media,
  metadata,
  secondaryActions,
  title,
}: CatalogProductCardFrameProps) {
  return <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-emerald-500 focus-within:ring-offset-2">
    {media}
    <div className="flex flex-1 flex-col p-3">
      <div className="h-4 min-w-0">{metadata}</div>
      <div className="mt-1 h-10 min-w-0">{title}</div>
      {context ? <div className="mt-2 min-h-8">{context}</div> : null}
      <div className="mt-3 grid gap-2 text-sm">
        <div className="h-[5.25rem]">{commercial}</div>
        <div className="h-[3.25rem]">{availability}</div>
      </div>
      <div className="mt-auto pt-3">
        {actions}
        {secondaryActions ? <div aria-label="Дополнительные действия" className="mt-2 flex min-h-11 justify-end gap-1.5">{secondaryActions}</div> : null}
      </div>
    </div>
  </article>;
}
