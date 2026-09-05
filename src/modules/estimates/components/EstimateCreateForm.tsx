"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import { ActionFeedback, actionClassName, FormField } from "../../platform-ui";
import { getEstimatesCopy, usePartnerLocale } from "../../partner-locale";
import { createEstimateAction, createEstimateFromSelectionAction } from "../actions/estimate.actions";
import { useLiveCommerceSelection } from "../../catalog/components/LiveCommerceSelectionProvider";
import { FinalCustomerPicker } from "./FinalCustomerPicker";

export function EstimateCreateForm({
  currencies,
  fromWorkingSelection = false,
  initialProductId = null,
}: {
  currencies: string[];
  fromWorkingSelection?: boolean;
  initialProductId?: string | null;
}) {
  const locale = usePartnerLocale();
  const copy = getEstimatesCopy(locale);
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"success" | "error">("error");
  const [pending, startTransition] = useTransition();
  const [finalCustomerId, setFinalCustomerId] = useState<string | null>(null);
  const workingSelection = useLiveCommerceSelection();
  const requestKey = useRef(crypto.randomUUID());
  const lineRequestKey = useRef(crypto.randomUUID());

  return (
    <form
      className="grid gap-x-5 gap-y-4 sm:grid-cols-2"
      onChange={() => {
        requestKey.current = crypto.randomUUID();
        lineRequestKey.current = crypto.randomUUID();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          const baseInput = {
            name: String(form.get("name") ?? "").trim() || copy.unnamed,
            finalCustomerId,
            projectName: String(form.get("projectName") ?? ""),
            currencyCode: String(form.get("currencyCode") ?? ""),
            validityDays: Number(form.get("validityDays")),
            requestKey: requestKey.current,
            lineRequestKey: lineRequestKey.current,
          };
          const result = fromWorkingSelection
            ? await createEstimateFromSelectionAction({
                ...baseInput,
                selections: workingSelection.items.map((item) => ({ productId: item.id, quantity: item.quantity })),
              })
            : await createEstimateAction({
            ...baseInput,
            productId: initialProductId,
            lineRequestKey: initialProductId ? lineRequestKey.current : null,
          });
          setMessageKind(result.success ? "success" : "error");
          setMessage(result.success ? copy.operationSucceeded : `${copy.operationFailed} ${copy.savedValuesKept}`);
          if (result.success) {
            if (fromWorkingSelection) workingSelection.clear();
            recordBehaviorInteraction({
              eventName: "estimate_created",
              route: "/cabinet/estimates/new",
              sourceSurface: "estimate_create",
            });
            router.push(`/cabinet/estimates/${result.data.id}`);
          }
        });
      }}
    >
      {fromWorkingSelection ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 sm:col-span-2" data-testid="estimate-selection-summary">
        <p className="text-sm font-semibold text-emerald-950">{localeSummary(locale, workingSelection.items.length, workingSelection.items.reduce((sum, item) => sum + item.quantity, 0))}</p>
        {!workingSelection.hydrated || !workingSelection.items.length ? <p className="mt-1 text-sm text-amber-800">{locale === "ro" ? "Selecția este goală. Reveniți în catalog și adăugați produse." : "Подборка пуста. Вернитесь в каталог и добавьте товары."}</p> : null}
      </div> : null}
      <div className="min-w-0 sm:col-span-2">
        <FinalCustomerPicker
          onChange={(customer) => setFinalCustomerId(customer?.id ?? null)}
          value={finalCustomerId}
        />
      </div>
      <div className="sm:col-span-2">
        <Field
          label={`${copy.name} (${copy.optional})`}
          name="name"
          placeholder={copy.unnamed}
        />
      </div>
      <details className="rounded-md border border-zinc-200 bg-zinc-50 sm:col-span-2">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-zinc-700">
          {copy.additionalSettings}
        </summary>
        <div className="grid gap-3 border-t border-zinc-200 p-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              label={copy.projectObject}
              name="projectName"
              placeholder={copy.notSpecified}
            />
          </div>
          <FormField label={copy.currency} required>
            {(props) => (
              <select
                {...props}
                className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 outline-none focus:border-emerald-600"
                disabled={!currencies.length}
                name="currencyCode"
                required
              >
                {currencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField
            helperText={copy.validityRange}
            label={copy.validityDays}
            required
          >
            {(props) => (
              <input
                {...props}
                className="h-11 w-full rounded-md border border-zinc-300 px-3 outline-none focus:border-emerald-600"
                defaultValue={14}
                max={365}
                min={1}
                name="validityDays"
                required
                type="number"
              />
            )}
          </FormField>
        </div>
      </details>
      {!currencies.length && (
        <p className="text-sm text-amber-800 sm:col-span-2">
          {copy.noPublishedCurrency}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4 sm:col-span-2">
        <button
          className={actionClassName.primary}
          disabled={pending || !currencies.length || !finalCustomerId || (fromWorkingSelection && (!workingSelection.hydrated || !workingSelection.items.length))}
          type="submit"
        >
          {pending ? copy.saving : initialProductId ? copy.create : copy.createAndContinue}
        </button>
        {message && (
          <ActionFeedback
            kind={messageKind}
            message={message}
          />
        )}
      </div>
    </form>
  );
}

function localeSummary(locale: "ru" | "ro", products: number, quantity: number): string {
  return locale === "ro" ? `Selecție: ${products} produse · ${quantity} buc.` : `Подборка: ${products} товаров · ${quantity} шт.`;
}

function Field({
  label,
  name,
  placeholder,
  required = false,
}: {
  label: string;
  name: string;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <FormField label={label} required={required}>
      {(props) => (
        <input
          {...props}
          className="h-11 w-full rounded-md border border-zinc-300 px-3 outline-none focus:border-emerald-600"
          maxLength={200}
          name={name}
          placeholder={placeholder}
          required={required}
        />
      )}
    </FormField>
  );
}
