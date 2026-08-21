"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import { ActionFeedback, actionClassName, FormField } from "../../platform-ui";
import { getEstimatesCopy, usePartnerLocale } from "../../partner-locale";
import { createEstimateAction } from "../actions/estimate.actions";
import { FinalCustomerPicker } from "./FinalCustomerPicker";

export function EstimateCreateForm({
  currencies,
  initialProductId = null,
}: {
  currencies: string[];
  initialProductId?: string | null;
}) {
  const copy = getEstimatesCopy(usePartnerLocale());
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"success" | "error">("error");
  const [pending, startTransition] = useTransition();
  const [finalCustomerId, setFinalCustomerId] = useState<string | null>(null);
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
          const result = await createEstimateAction({
            name: String(form.get("name") ?? ""),
            finalCustomerId,
            projectName: String(form.get("projectName") ?? ""),
            currencyCode: String(form.get("currencyCode") ?? ""),
            validityDays: Number(form.get("validityDays")),
            requestKey: requestKey.current,
            productId: initialProductId,
            lineRequestKey: initialProductId ? lineRequestKey.current : null,
          });
          setMessageKind(result.success ? "success" : "error");
          setMessage(result.success ? copy.operationSucceeded : `${copy.operationFailed} ${copy.savedValuesKept}`);
          if (result.success) {
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
      <div className="sm:col-span-2">
        <Field
          label={copy.name}
          name="name"
          placeholder={copy.unnamed}
          required
        />
      </div>
      <div className="min-w-0 sm:col-span-2">
        <FinalCustomerPicker
          onChange={(customer) => setFinalCustomerId(customer?.id ?? null)}
          value={finalCustomerId}
        />
      </div>
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
      {!currencies.length && (
        <p className="text-sm text-amber-800 sm:col-span-2">
          {copy.noPublishedCurrency}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4 sm:col-span-2">
        <button
          className={actionClassName.primary}
          disabled={pending || !currencies.length || !finalCustomerId}
          type="submit"
        >
          {pending ? copy.saving : copy.create}
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
