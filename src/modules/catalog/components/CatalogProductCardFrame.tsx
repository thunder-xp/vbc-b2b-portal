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
  density?: "comfortable" | "compact";
  className?: string;
  square?: boolean;
  tone?: "default" | "retail";
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
  density = "comfortable",
  className = "",
  square = false,
  tone = "default",
}: CatalogProductCardFrameProps) {
  const compact = density === "compact";
  return <article className={`flex h-full min-w-0 flex-col overflow-hidden border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-offset-2 ${tone === "retail" ? "focus-within:ring-blue-500" : "focus-within:ring-emerald-500"} ${square ? "" : "rounded-md"} ${className}`.trim()}>
    {media}
    <div className={`flex flex-1 flex-col ${compact ? "p-2.5" : "p-3"}`}>
      <div className="h-4 min-w-0">{metadata}</div>
      <div className="mt-1 h-10 min-w-0">{title}</div>
      {context ? <div className={compact ? "mt-1 min-h-4" : "mt-2 min-h-8"}>{context}</div> : null}
      <div className={`${compact ? "mt-2 gap-1" : "mt-3 gap-2"} grid text-sm`}>
        <div className={compact ? "h-12" : "h-[5.25rem]"}>{commercial}</div>
        <div className={compact ? "h-8" : "h-[3.25rem]"}>{availability}</div>
      </div>
      <div className={`mt-auto ${compact ? "pt-2" : "pt-3"}`}>
        {actions}
        {secondaryActions ? <div aria-label="Дополнительные действия" className="mt-2 flex min-h-11 justify-end gap-1.5">{secondaryActions}</div> : null}
      </div>
    </div>
  </article>;
}
