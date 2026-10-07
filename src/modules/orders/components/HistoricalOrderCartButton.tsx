"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { partnerNavigationIcons } from "../../partner-cabinet/components/partner-navigation-icons";
import { addHistoricalOrderToCartAction } from "../actions/reorder.actions";
import type { QuickReorderConversionResultDto } from "../services/quick-reorder.service";

const CartIcon = partnerNavigationIcons.cart;

export function HistoricalOrderCartButton({ orderId, lineId, compact = false, locale }: {
  orderId: string;
  lineId?: string;
  compact?: boolean;
  locale: "ru" | "ro";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const requestKey = useRef<string | null>(null);
  const [result, setResult] = useState<QuickReorderConversionResultDto | null>(null);
  const [failed, setFailed] = useState(false);
  const label = locale === "ro" ? "În coș" : "В корзину";
  const issues = result?.items.filter((item) => ["unavailable", "inactive", "skipped"].includes(item.result)) ?? [];
  const add = () => startTransition(async () => {
    requestKey.current ??= crypto.randomUUID();
    const response = await addHistoricalOrderToCartAction({ orderId, requestKey: requestKey.current, ...(lineId ? { lineId } : {}) });
    setFailed(!response.success);
    if (!response.success) return;
    requestKey.current = null;
    setResult(response.data);
    if (response.data.cartId && !compact && !response.data.items.some((item) => ["unavailable", "inactive", "skipped"].includes(item.result))) {
      router.push("/cabinet/cart");
    } else {
      router.refresh();
    }
  });

  return <div className={compact ? "min-w-0" : "w-full sm:w-auto"} data-order-cart-action={lineId ?? "all"}>
    <button aria-label={label} className={compact
      ? "inline-flex size-11 items-center justify-center rounded-md border border-zinc-300 bg-white text-emerald-700 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50"
      : "inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50"}
      disabled={pending || (compact && !lineId)} onClick={add} title={label} type="button">
      <CartIcon aria-hidden="true" className="size-4" />{compact ? null : label}
    </button>
    <div aria-live="polite" className="text-xs">
      {failed ? <p className="mt-1 text-red-700">{locale === "ro" ? "Nu s-a putut adăuga în coș. Încercați din nou." : "Не удалось добавить в корзину. Повторите попытку."}</p> : null}
      {result ? <>
        {result.cartId ? <Link className="mt-1 inline-block font-medium text-emerald-700 underline" href="/cabinet/cart" prefetch={false}>{locale === "ro" ? "Deschide coșul" : "Открыть корзину"}</Link> : null}
        {issues.map((item) => <p className="mt-1 text-amber-800" key={item.lineId}>{item.productName} ({item.sku}): {locale === "ro" ? "poziția nu poate fi reprezentată în coș" : "позиция не может быть представлена в корзине"}</p>)}
      </> : null}
    </div>
  </div>;
}
