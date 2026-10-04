"use client";

import { useRouter } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { useState, useTransition } from "react";
import { formatPartnerMoney, secondaryCopy, usePartnerLocale } from "@/src/modules/partner-locale";

import { addCampaignItemToCartAction } from "../actions/commercial-campaign.actions";
import type { CampaignMechanicType, CampaignMoney } from "../types";

export function CampaignCartControl({
  itemId,
  minimum,
  maximum,
  mechanicType,
  promoThresholdQuantity,
  promoPrice,
}: {
  itemId: string;
  minimum: number;
  maximum: number | null;
  mechanicType: CampaignMechanicType;
  promoThresholdQuantity: number | null;
  promoPrice: CampaignMoney | null;
}) {
  const router = useRouter();
  const locale = usePartnerLocale();
  const copy = secondaryCopy(locale);
  const [quantity, setQuantity] = useState(minimum);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const threshold = mechanicType === "quantity_threshold_promo" ? promoThresholdQuantity : null;
  const remaining = threshold ? Math.max(0, threshold - quantity) : 0;
  const eligibilityMessage = threshold && promoPrice
    ? remaining > 0
      ? locale === "ro"
        ? `Adăugați încă ${remaining} buc. pentru prețul PROMO.`
        : `Добавьте ещё ${remaining} шт., чтобы получить PROMO.`
      : locale === "ro"
        ? `PROMO activă · ${threshold}+ buc. → ${formatPartnerMoney(promoPrice.amount, "USD", locale)}`
        : `PROMO активна · ${threshold}+ шт. → ${formatPartnerMoney(promoPrice.amount, "USD", locale)}`
    : "";
  return (
    <div className="mt-4 flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-xs font-medium text-zinc-600">
        {copy.quantity}
        <input
          aria-label={`${copy.quantity} ${locale === "ro" ? "produs" : "товара"}`}
          className="h-11 w-24 rounded-md border border-zinc-300 px-3 text-base"
          max={maximum ?? 9999}
          min={minimum}
          onChange={(event) => setQuantity(Number(event.target.value))}
          type="number"
          value={quantity}
        />
      </label>
      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-zinc-300"
        disabled={
          pending ||
          quantity < minimum ||
          Boolean(maximum && quantity > maximum)
        }
        onClick={() =>
          startTransition(async () => {
            const result = await addCampaignItemToCartAction({
              campaignItemId: itemId,
              quantity,
              requestId,
            });
            setMessage(
              result.success
                ? locale === "ro"
                  ? "Produs adăugat în coș."
                  : result.message
                : copy.cartError,
            );
            if (result.success) { setRequestId(crypto.randomUUID()); if (mechanicType === "fixed_bundle_promo" || mechanicType === "conditional_attach_promo") router.refresh(); }
          })
        }
        type="button"
      >
        <ShoppingCart aria-hidden="true" className="size-4" />
        {pending ? copy.adding : copy.addToCart}
      </button>
      {eligibilityMessage ? (
        <p className={`w-full text-sm font-medium ${remaining > 0 ? "text-zinc-600" : "text-emerald-800"}`} data-testid="campaign-promo-eligibility">
          {eligibilityMessage}
        </p>
      ) : null}
      {message ? (
        <p className="w-full text-sm text-zinc-700" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
