import { getRetailCartTokenHash } from "../retail-cart-cookie";
import { getRetailCartService } from "../retail-cart-server";
import type { PublicRetailLocale } from "../types";
import { PublicRetailCartBadgeClient } from "./PublicRetailCartBadgeClient";

export async function PublicRetailCartBadge({ locale, totalQuantity, deferSummary = false }: { locale: PublicRetailLocale; totalQuantity?: number; deferSummary?: boolean }) {
  if (deferSummary && totalQuantity === undefined) {
    return <PublicRetailCartBadgeClient deferSummary initialQuantity={0} locale={locale} />;
  }
  const summary = totalQuantity === undefined
    ? await getRetailCartService().getSummary(await getRetailCartTokenHash()).catch(() => ({ distinctItemCount: 0, totalQuantity: 0 }))
    : { distinctItemCount: 0, totalQuantity };
  return <PublicRetailCartBadgeClient initialQuantity={summary.totalQuantity} key={summary.totalQuantity} locale={locale} />;
}
