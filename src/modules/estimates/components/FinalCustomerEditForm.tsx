"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateFinalCustomerAction } from "../actions";
import {
  FINAL_CUSTOMER_INDUSTRIES,
  type FinalCustomer,
  type FinalCustomerIndustryCode,
  type FinalCustomerType,
} from "../types";
import {
  finalCustomerIndustryLabelForLocale,
  getEstimatesCopy,
  usePartnerLocale,
} from "../../partner-locale";

const controlClass =
  "min-h-11 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200";

export function FinalCustomerEditForm({
  customer,
}: {
  customer: FinalCustomer;
}) {
  const router = useRouter();
  const locale = usePartnerLocale();
  const copy = getEstimatesCopy(locale);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [customerType, setCustomerType] = useState<FinalCustomerType>(
    customer.customerType,
  );
  const [industryCode, setIndustryCode] = useState<
    FinalCustomerIndustryCode | ""
  >(customer.industryCode ?? "");

  return (
    <form
      className="grid min-w-0 gap-4 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await updateFinalCustomerAction(
            customer.id,
            customer.revision,
            {
              displayName: String(form.get("displayName") ?? ""),
              customerType,
              fiscalCode: String(form.get("fiscalCode") ?? ""),
              locality: String(form.get("locality") ?? ""),
              industryCode: industryCode || null,
            },
          );
          setMessage(result.success ? copy.saved : copy.customerSaveError);
          if (result.success) router.refresh();
        });
      }}
    >
      <label className="text-sm font-medium text-zinc-700">
        {copy.customer}
        <input
          className={controlClass}
          defaultValue={customer.displayName}
          maxLength={200}
          name="displayName"
          required
        />
      </label>
      <label className="text-sm font-medium text-zinc-700">
        {copy.type}
        <select
          className={controlClass}
          onChange={(event) =>
            setCustomerType(event.target.value as FinalCustomerType)
          }
          value={customerType}
        >
          <option value="company">{copy.companyType}</option>
          <option value="individual">{copy.individualType}</option>
        </select>
      </label>
      <label className="text-sm font-medium text-zinc-700">
        IDNO
        <input
          className={controlClass}
          defaultValue={customer.fiscalCode ?? ""}
          maxLength={32}
          name="fiscalCode"
        />
      </label>
      <label className="text-sm font-medium text-zinc-700">
        {copy.cityRegion}
        <input
          className={controlClass}
          defaultValue={customer.locality ?? ""}
          maxLength={120}
          name="locality"
        />
      </label>
      <label className="text-sm font-medium text-zinc-700 md:col-span-2">
        {copy.industry}
        <select
          className={controlClass}
          onChange={(event) =>
            setIndustryCode(
              event.target.value as FinalCustomerIndustryCode | "",
            )
          }
          value={industryCode}
        >
          <option value="">{copy.notSpecifiedFeminine}</option>
          {FINAL_CUSTOMER_INDUSTRIES.map((industry) => (
            <option key={industry.code} value={industry.code}>
              {finalCustomerIndustryLabelForLocale(
                locale,
                industry.code,
                copy.notSpecifiedFeminine,
              )}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button
          className="min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          {pending ? copy.saving : copy.save}
        </button>
        {message ? (
          <p aria-live="polite" className="text-sm text-zinc-600">
            {message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
