"use client";

import { X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import {
  addCatalogProductToPurchasingListAction,
  createPurchasingListAction,
  listManageablePurchasingListsAction,
} from "../actions";
import { procurementCopy, usePartnerLocale } from "../../partner-locale";

type Choice = { id: string; name: string; revision: number };

export function PurchasingListChooserDialog({
  onClose,
  productId,
}: {
  onClose: () => void;
  productId: string;
}) {
  const copy = procurementCopy(usePartnerLocale());
  const [choices, setChoices] = useState<Choice[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void listManageablePurchasingListsAction().then((result) => {
      if (!active) return;
      if (result.success) setChoices(result.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/45 p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="dialog"
    >
      <form
        className="w-full max-w-md rounded-lg bg-white p-5"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(async () => {
            let listId = String(data.get("listId"));
            if (listId === "new") {
              const created = await createPurchasingListAction({
                name: String(data.get("newName")),
                description: null,
                visibility: "private",
              });
              if (!created.success) {
                setMessage(copy.listCreateError);
                return;
              }
              listId = created.data.id;
            }
            const result = await addCatalogProductToPurchasingListAction({
              listId,
              productId,
              quantity: Number(data.get("quantity")),
              mergeMode: String(data.get("mergeMode")) as
                "increase" | "replace" | "keep",
            });
            setMessage(
              result.success ? copy.productAdded : copy.productAddError,
            );
          });
        }}
      >
        <div className="flex justify-between">
          <h2 className="font-semibold">{copy.addOtherList}</h2>
          <button aria-label={copy.close} onClick={onClose} type="button">
            <X className="size-5" />
          </button>
        </div>
        <label className="mt-4 block text-sm">
          {copy.chooseList}
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
            disabled={loading}
            name="listId"
            required
          >
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.name}
              </option>
            ))}
            <option value="new">{copy.createNew}</option>
          </select>
        </label>
        <label className="mt-3 block text-sm">
          {copy.newListName}
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
            maxLength={120}
            name="newName"
            placeholder={copy.usedWhenCreating}
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-sm">
            {copy.quantity}
            <input
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={1}
              max={9999}
              min={1}
              name="quantity"
              type="number"
            />
          </label>
          <label className="text-sm">
            {copy.ifExists}
            <select
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
              name="mergeMode"
            >
              <option value="increase">{copy.increase}</option>
              <option value="replace">{copy.replace}</option>
              <option value="keep">{copy.keep}</option>
            </select>
          </label>
        </div>
        {message ? (
          <p className="mt-3 text-sm" role="status">
            {message}
          </p>
        ) : null}
        <button
          className="mt-5 w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-zinc-300"
          disabled={loading || pending}
          type="submit"
        >
          {pending ? copy.adding : copy.add}
        </button>
      </form>
    </div>
  );
}
