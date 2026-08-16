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
    className: "border-amber-300 bg-amber-50 text-amber-900",
  },
  HOT: {
    label: "Горячая цена",
    className: "border-rose-200 bg-rose-50 text-rose-800",
  },
  SPECIAL_OFFER: {
    label: "Спецпредложение",
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
};

export function MerchandisingBadges({
  labels = [],
  labelOverrides,
  square = false,
  tone = "default",
}: {
  labels?: MerchandisingLabelCode[];
  labelOverrides?: Partial<Record<MerchandisingLabelCode, string>>;
  square?: boolean;
  tone?: "default" | "retail";
}) {
  const visible = [...new Set(labels)].slice(0, 2);
  if (!visible.length) return null;

  return (
    <div aria-label="Подборки товара" className="flex flex-wrap gap-1.5">
      {visible.map((code) => (
        <span
          className={`${square ? "" : "rounded"} border px-1.5 py-0.5 text-[10px] font-semibold ${tone === "retail" && code === "TOP" ? "border-amber-300 bg-amber-50 text-amber-900" : LABELS[code].className}`}
          key={code}
        >
          {labelOverrides?.[code] ?? LABELS[code].label}
        </span>
      ))}
    </div>
  );
}
