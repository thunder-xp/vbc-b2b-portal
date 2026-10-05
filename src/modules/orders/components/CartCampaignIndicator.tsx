import type { CartCampaignContext } from "../../pricing-inventory/types/effective-price";

/** Display server-resolved intent/progress, never infer a benefit from the product. */
export function CartCampaignIndicator({ context, locale }: {
  context: CartCampaignContext | null | undefined;
  locale: "ru" | "ro";
}) {
  if (!context) return null;
  const progress = context.progress;
  const missing = progress?.components?.reduce((sum, item) => sum + item.missingQuantity, 0)
    ?? progress?.triggers?.reduce((sum, item) => sum + item.missingQuantity, 0)
    ?? (context.thresholdQuantity ? Math.max(0, context.thresholdQuantity - context.requestedQuantity) : 0);
  const remainingSpend = Number(progress?.remainingSpendUsd ?? 0);
  const normalComponent = context.reason === "trigger_normal_price" || context.reason === "qualifying_normal_price";
  const unmet = !context.eligible && (!normalComponent || missing > 0 || remainingSpend > 0);
  return (
    <div className="mt-1 text-xs text-zinc-600" data-cart-campaign-intent>
      <span className="font-medium">{locale === "ro" ? "Ofertă specială" : "Спецпредложение"}</span>
      {unmet ? <span className="ml-1">
        · {locale === "ro" ? "Condițiile ofertei nu sunt încă îndeplinite" : "Условия предложения ещё не выполнены"}
        {missing > 0 ? ` · +${missing} ${locale === "ro" ? "buc." : "шт."}` : ""}
        {remainingSpend > 0 ? ` · +${remainingSpend.toFixed(2)} USD` : ""}
      </span> : null}
    </div>
  );
}
