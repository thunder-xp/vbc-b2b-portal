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
  square = false,
  tone = "default",
}: CatalogProductCardFrameProps) {
  const compact = density === "compact";
  return <article className={`catalog-card ${tone === "retail" ? "catalog-card-retail" : "catalog-card-partner"} ${square ? "" : "rounded-md"}`}>
    {media}
    <div className={`catalog-card-body ${compact ? "p-2.5" : "p-3"}`}>
      <div className="catalog-card-metadata">{metadata}</div>
      <div className="catalog-card-title">{title}</div>
      {context ? <div className={compact ? "mt-1 min-h-4" : "mt-2 min-h-8"}>{context}</div> : null}
      <div className={`${compact ? "mt-2 gap-1" : "mt-3 gap-2"} catalog-card-commercial-stack`}>
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
