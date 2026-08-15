import type { MerchandisingLabelCode } from "../../merchandising/types";

const LABELS: Record<
  MerchandisingLabelCode,
  { label: string; className: string }
> = {
  NEW: {
    label: "Новинка",
    className: "border-sky-200 bg-sky-50 text-sky-800",
  },
  TOP: {
    label: "Популярный",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  HOT: {
    label: "Горячая цена",
    className: "border-rose-200 bg-rose-50 text-rose-800",
  },
};

export function MerchandisingBadges({
  labels = [],
  labelOverrides,
}: {
  labels?: MerchandisingLabelCode[];
  labelOverrides?: Partial<Record<MerchandisingLabelCode, string>>;
}) {
  const visible = [...new Set(labels)].slice(0, 2);
  if (!visible.length) return null;

  return (
    <div aria-label="Подборки товара" className="flex flex-wrap gap-1.5">
      {visible.map((code) => (
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${LABELS[code].className}`}
          key={code}
        >
          {labelOverrides?.[code] ?? LABELS[code].label}
        </span>
      ))}
    </div>
  );
}
