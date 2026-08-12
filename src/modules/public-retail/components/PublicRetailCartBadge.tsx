import { getRetailCartTokenHash } from "../retail-cart-cookie";
import { getRetailCartService } from "../retail-cart-server";
import type { PublicRetailLocale } from "../types";
import { PublicRetailCartBadgeClient } from "./PublicRetailCartBadgeClient";

export async function PublicRetailCartBadge({ locale, totalQuantity }: { locale: PublicRetailLocale; totalQuantity?: number }) {
  const summary = totalQuantity === undefined
    ? await getRetailCartService().getSummary(await getRetailCartTokenHash()).catch(() => ({ distinctItemCount: 0, totalQuantity: 0 }))
    : { distinctItemCount: 0, totalQuantity };
  return <PublicRetailCartBadgeClient initialQuantity={summary.totalQuantity} key={summary.totalQuantity} locale={locale} />;
}
