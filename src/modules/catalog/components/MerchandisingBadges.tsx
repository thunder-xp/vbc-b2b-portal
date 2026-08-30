import type { MerchandisingLabelCode } from "../../merchandising/types";
import type { ReactNode } from "react";

const LABELS: Record<
  MerchandisingLabelCode,
  { label: string; className: string }
> = {
  NEW: {
    label: "Новинки",
    className: "border-sky-200 bg-sky-50 text-sky-800",
  },
  TOP: {
    label: "Популярное",
    className: "border-amber-300 bg-amber-50 text-amber-900",
  },
  HOT: {
    label: "Горячая цена",
    className: "border-rose-200 bg-rose-50 text-rose-800",
  },
  SPECIAL_OFFER: {
    label: "Спецпредложения",
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
};

export type MerchandisingBadgeVariant = MerchandisingLabelCode | "REPLENISHMENT";

const BADGE_CLASS = "inline-flex min-h-6 max-w-full items-center rounded-sm border px-2 text-center text-[11px] font-semibold leading-4 shadow-sm [overflow-wrap:anywhere]";

export function MerchandisingBadge({ icon, label, variant }: { icon?: ReactNode; label: string; variant: MerchandisingBadgeVariant }) {
  const className = variant === "REPLENISHMENT"
    ? "border-emerald-700 bg-emerald-50 text-emerald-900"
    : LABELS[variant].className;
  return <span aria-label={icon ? label : undefined} className={`${BADGE_CLASS} ${icon ? "size-6 justify-center px-0" : ""} ${className}`} title={icon ? label : undefined}>{icon}{icon ? <span className="sr-only">{label}</span> : label}</span>;
}

export function MerchandisingBadgeOverlay({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none absolute left-2 top-2 z-10 max-w-[calc(100%-1rem)]">{children}</div>;
}

export function MerchandisingBadges({
  labels = [],
  labelOverrides,
  productCollectionsLabel = "Подборки товара",
}: {
  labels?: MerchandisingLabelCode[];
  labelOverrides?: Partial<Record<MerchandisingLabelCode, string>>;
  productCollectionsLabel?: string;
}) {
  const visible = [...new Set(labels)].slice(0, 2);
  if (!visible.length) return null;

  return (
    <div aria-label={productCollectionsLabel} className="flex flex-wrap gap-1.5">
      {visible.map((code) => (
        <MerchandisingBadge key={code} label={labelOverrides?.[code] ?? LABELS[code].label} variant={code} />
      ))}
    </div>
  );
}
