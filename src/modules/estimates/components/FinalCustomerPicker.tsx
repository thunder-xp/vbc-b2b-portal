"use client";

import { Building2, Plus, Search, UserRound } from "lucide-react";
import { useEffect, useId, useState, useTransition } from "react";

import { createFinalCustomerAction, searchFinalCustomersAction, updateFinalCustomerAction } from "../actions/estimate.actions";
import { FINAL_CUSTOMER_INDUSTRIES, type FinalCustomer, type FinalCustomerIndustryCode, type FinalCustomerType } from "../types";
import { finalCustomerIndustryLabelForLocale, getEstimatesCopy, usePartnerLocale, type EstimatesCopy, type PartnerLocale } from "../../partner-locale";

type Props = {
  disabled?: boolean;
  initialName?: string | null;
  onChange?: (customer: FinalCustomer | null) => void;
  value: string | null;
};

const inputClass = "min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:bg-zinc-100";

export function FinalCustomerPicker({ disabled = false, initialName, onChange, value }: Props) {
  const locale = usePartnerLocale();
  const copy = getEstimatesCopy(locale);
  const listId = useId();
  const [query, setQuery] = useState(initialName ?? "");
  const [results, setResults] = useState<FinalCustomer[]>([]);
  const [selectedName, setSelectedName] = useState(initialName ?? "");
  const [selectedCustomer, setSelectedCustomer] = useState<FinalCustomer | null>(null);
  const [engaged, setEngaged] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!engaged || disabled || value || query.trim().length < 2) {
      return;
    }
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const result = await searchFinalCustomersAction(query);
        setResults(result.success ? result.data : []);
        if (!result.success) setMessage(copy.operationFailed);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [copy.operationFailed, disabled, engaged, query, value]);

  const select = (customer: FinalCustomer) => {
    setSelectedName(customer.displayName);
    setSelectedCustomer(customer);
    setQuery(customer.displayName);
    setResults([]);
    setMessage(null);
    onChange?.(customer);
  };

  return <div className="min-w-0 max-w-full space-y-2">
    <label className="block text-sm font-medium text-zinc-700" htmlFor={`${listId}-input`}>{copy.customer} <span aria-hidden="true" className="text-red-600">*</span></label>
    <input name="finalCustomerId" type="hidden" value={value ?? ""} />
    {value ? <div className="flex min-h-11 min-w-0 max-w-full flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3">
      <span className="min-w-0 truncate text-sm font-medium text-zinc-900">{selectedName}</span>
      {!disabled && <span className="flex min-w-0 flex-wrap gap-3">{selectedCustomer && <button className="min-h-11 text-sm font-semibold text-emerald-800" onClick={() => setCreating(true)} type="button">{copy.editCustomerAction}</button>}<button className="min-h-11 text-sm font-semibold text-emerald-800" onClick={() => { setQuery(""); setSelectedName(""); setSelectedCustomer(null); onChange?.(null); }} type="button">{copy.chooseAnother}</button></span>}
    </div> : <div className="relative">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 size-4 text-zinc-400" />
      <input
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={results.length > 0}
        autoComplete="off"
        className={`${inputClass} pl-9`}
        disabled={disabled}
        id={`${listId}-input`}
        onChange={(event) => { setEngaged(true); setQuery(event.target.value); setResults([]); setMessage(null); }}
        placeholder={copy.customerPlaceholder}
        role="combobox"
        value={query}
      />
      {results.length > 0 && <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-zinc-200 bg-white p-1 shadow-lg" id={listId} role="listbox">
        {results.map((customer) => <button aria-selected="false" className="flex min-h-11 w-full items-center gap-3 rounded px-3 text-left hover:bg-zinc-50 focus-visible:bg-zinc-50" key={customer.id} onClick={() => select(customer)} role="option" type="button">
          {customer.customerType === "company" ? <Building2 className="size-4 shrink-0 text-zinc-500" /> : <UserRound className="size-4 shrink-0 text-zinc-500" />}
          <span className="min-w-0"><span className="block truncate text-sm font-medium">{customer.displayName}</span><span className="block truncate text-xs text-zinc-500">{[customer.fiscalCode, customer.locality].filter(Boolean).join(" · ") || copy.noAdditionalDetails}</span></span>
        </button>)}
      </div>}
    </div>}
    {!disabled && !value && <button className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-800" onClick={() => setCreating((current) => !current)} type="button"><Plus className="size-4" />{copy.createCustomer}</button>}
    {creating && (!value || selectedCustomer) && <CustomerCreateFields copy={copy} customer={selectedCustomer} disabled={pending} initialName={query} locale={locale} onCancel={() => setCreating(false)} onCreated={(customer) => { select(customer); setCreating(false); }} onMessage={setMessage} />}
    {message && <p aria-live="polite" className="text-sm text-red-700">{message}</p>}
  </div>;
}

function CustomerCreateFields({ copy, customer, disabled, initialName, locale, onCancel, onCreated, onMessage }: {
  copy: EstimatesCopy;
  customer: FinalCustomer | null;
  disabled: boolean;
  initialName: string;
  locale: PartnerLocale;
  onCancel: () => void;
  onCreated: (customer: FinalCustomer) => void;
  onMessage: (message: string) => void;
}) {
  const [customerType, setCustomerType] = useState<FinalCustomerType>(customer?.customerType ?? "company");
  const [industryCode, setIndustryCode] = useState<FinalCustomerIndustryCode | "">(customer?.industryCode ?? "");
  const [pending, startTransition] = useTransition();
  return <fieldset className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4" disabled={disabled || pending}>
    <legend className="px-1 text-sm font-semibold">{customer ? copy.customerDetails : copy.newCustomer}</legend>
    <label className="text-xs font-medium text-zinc-600">{copy.type}<select className={inputClass} name="newCustomerType" onChange={(event) => setCustomerType(event.target.value as FinalCustomerType)} value={customerType}><option value="company">{copy.companyType}</option><option value="individual">{copy.individualType}</option></select></label>
    <label className="text-xs font-medium text-zinc-600">{copy.customerName}<input className={inputClass} defaultValue={customer?.displayName ?? initialName} maxLength={200} name="newCustomerName" required /></label>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-xs font-medium text-zinc-600">IDNO<input className={inputClass} defaultValue={customer?.fiscalCode ?? ""} maxLength={32} name="newCustomerFiscalCode" /></label>
      <label className="text-xs font-medium text-zinc-600">{copy.locality}<input className={inputClass} defaultValue={customer?.locality ?? ""} maxLength={120} name="newCustomerLocality" /></label>
      <label className="text-xs font-medium text-zinc-600">{copy.industry}<select className={inputClass} name="newCustomerIndustryCode" onChange={(event) => setIndustryCode(event.target.value as FinalCustomerIndustryCode | "")} value={industryCode}><option value="">{copy.notSpecifiedFeminine}</option>{FINAL_CUSTOMER_INDUSTRIES.map((industry) => <option key={industry.code} value={industry.code}>{finalCustomerIndustryLabelForLocale(locale, industry.code, industry.label)}</option>)}</select></label>
    </div>
    <div className="flex flex-wrap justify-end gap-2">
      <button className="min-h-11 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold" onClick={onCancel} type="button">{copy.cancel}</button>
      <button className="min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" onClick={(event) => {
        const fieldset = event.currentTarget.closest("fieldset");
        if (!fieldset) return;
        const get = (name: string) => (fieldset.querySelector(`[name="${name}"]`) as HTMLInputElement | null)?.value ?? "";
        startTransition(async () => {
          const payload = { displayName: get("newCustomerName"), customerType, fiscalCode: get("newCustomerFiscalCode"), locality: get("newCustomerLocality"), industryCode: industryCode || null };
          const result = customer
            ? await updateFinalCustomerAction(customer.id, customer.revision, payload)
            : await createFinalCustomerAction(payload);
          if (result.success) onCreated(result.data); else onMessage(copy.customerSaveError);
        });
      }} type="button">{pending ? copy.savingShort : customer ? copy.save : copy.create}</button>
    </div>
  </fieldset>;
}
