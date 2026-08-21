import type { ProductCommercialViewDto } from "../../pricing-inventory";
import { formatPartnerDate, getCatalogCopy, type PartnerLocale } from "../../partner-locale";

type StockView = ProductCommercialViewDto["stock"];

export function ProductAvailabilityBlock({ locale = "ru", stock }: { locale?: PartnerLocale; stock?: StockView | null }) {
  const tone = getAvailabilityTone(stock?.status);

  return (
    <div className={`flex h-full min-w-0 items-center gap-2 border-l-2 px-2 py-1.5 ${tone.container}`}>
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${tone.indicator}`} />
      <span className={`line-clamp-2 whitespace-pre-line text-xs font-semibold leading-4 ${tone.text}`}>
        {availabilityLabel(stock, locale)}
      </span>
    </div>
  );
}

function availabilityLabel(stock: StockView | null | undefined, locale: PartnerLocale): string {
  const copy = getCatalogCopy(locale);
  if (!stock) return copy.availabilityPending;
  const quantity = stock.exactAvailableQuantity;
  const unit = locale === "ro" ? "buc." : "шт.";
  switch (stock.status) {
    case "in_stock":
      return quantity === null ? copy.inStock : `${copy.inStock}: ${quantity} ${unit}`;
    case "low_stock":
      return quantity === null ? copy.lowStock : `${copy.remaining}: ${quantity} ${unit}`;
    case "expected": {
      const date = stock.expectedArrival?.expectedDate;
      return date
        ? `${copy.expectedArrival}\n${formatPartnerDate(date, locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`
        : copy.expectedArrival;
    }
    case "out_of_stock":
      return copy.outOfStock;
    default:
      return copy.availabilityPending;
  }
}

function getAvailabilityTone(status: StockView extends infer T ? T extends { status: infer S } ? S | undefined : undefined : undefined) {
  switch (status) {
    case "in_stock":
      return { container: "border-emerald-500 bg-emerald-50/60", indicator: "bg-emerald-600", text: "text-emerald-900" };
    case "low_stock":
      return { container: "border-amber-500 bg-amber-50/60", indicator: "bg-amber-600", text: "text-amber-950" };
    case "expected":
      return { container: "border-sky-500 bg-sky-50/60", indicator: "bg-sky-600", text: "text-sky-950" };
    case "out_of_stock":
      return { container: "border-rose-400 bg-rose-50/60", indicator: "bg-rose-600", text: "text-rose-950" };
    default:
      return { container: "border-zinc-300 bg-zinc-50", indicator: "bg-zinc-500", text: "text-zinc-700" };
  }
}
