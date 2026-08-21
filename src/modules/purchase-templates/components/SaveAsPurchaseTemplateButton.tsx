"use client";

import { BookmarkPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  createPurchaseTemplateFromCartAction,
  createPurchaseTemplateFromOrderAction,
  createPurchaseTemplateFromPurchasingListAction,
} from "../actions";
import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import { procurementCopy, usePartnerLocale } from "../../partner-locale";

type Source =
  | { type: "cart" }
  | { type: "order"; id: string }
  | { type: "purchasing_list"; id: string };

export function SaveAsPurchaseTemplateButton({ source }: { source: Source }) {
  const router = useRouter();
  const copy = procurementCopy(usePartnerLocale());
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return (
    <>
      <button
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:border-emerald-600"
        onClick={() => setOpen(true)}
        type="button"
      >
        <BookmarkPlus aria-hidden="true" className="size-4" />
        {copy.saveAsTemplate}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/45 p-4"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
          role="presentation"
        >
          <form
            aria-label={copy.saveAsTemplate}
            className="w-full max-w-md rounded-md bg-white p-5 shadow-xl"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const meta = {
                name: String(data.get("name")),
                description: String(data.get("description")),
                visibility: String(data.get("visibility")) as
                  "private" | "company",
                requestKey,
              };
              startTransition(async () => {
                const result =
                  source.type === "cart"
                    ? await createPurchaseTemplateFromCartAction(meta)
                    : source.type === "order"
                      ? await createPurchaseTemplateFromOrderAction({
                          ...meta,
                          orderId: source.id,
                        })
                      : await createPurchaseTemplateFromPurchasingListAction({
                          ...meta,
                          listId: source.id,
                        });
                if (result.success) {
                  recordBehaviorInteraction({
                    eventName:
                      source.type === "cart"
                        ? "purchase_template_created_from_cart"
                        : source.type === "order"
                          ? "purchase_template_created_from_order"
                          : "purchase_template_created_from_list",
                    route:
                      source.type === "cart"
                        ? "/cabinet/cart"
                        : source.type === "order"
                          ? "/cabinet/orders/detail"
                          : "/cabinet/purchasing-lists/detail",
                    sourceSurface: `purchase_template_from_${source.type}`,
                  });
                  setRequestKey(crypto.randomUUID());
                  router.push(`/cabinet/purchase-templates/${result.data.id}`);
                } else setError(copy.saveTemplateError);
              });
            }}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{copy.newTemplateTitle}</h2>
              <button
                aria-label={copy.close}
                className="grid size-11 place-items-center"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="size-5" />
              </button>
            </div>
            <label className="mt-4 block text-sm">
              {copy.name}
              <input
                className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3"
                maxLength={120}
                name="name"
                required
              />
            </label>
            <label className="mt-3 block text-sm">
              {copy.description}
              <textarea
                className="mt-1 min-h-20 w-full rounded-md border border-zinc-300 px-3 py-2"
                maxLength={1000}
                name="description"
              />
            </label>
            <label className="mt-3 block text-sm">
              {copy.access}
              <select
                className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3"
                name="visibility"
              >
                <option value="private">{copy.private}</option>
                <option value="company">{copy.company}</option>
              </select>
            </label>
            {error ? (
              <p className="mt-3 text-sm text-rose-700" role="alert">
                {error}
              </p>
            ) : null}
            <button
              className="mt-5 min-h-11 w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-zinc-300"
              disabled={pending}
              type="submit"
            >
              {pending ? copy.saving : copy.save}
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
