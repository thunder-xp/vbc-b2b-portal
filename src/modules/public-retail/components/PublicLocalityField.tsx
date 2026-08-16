"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

import { MOLDOVA_PRIMARY_LOCALITIES, OTHER_LOCALITY_CODE } from "@/src/modules/retail-marketplace/moldova-localities";
import type { PublicRetailLocale } from "../types";

const inputClass = "block h-11 w-full border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100";

export function PublicLocalityField({ locale }: { locale: PublicRetailLocale }) {
  const [code, setCode] = useState("");
  const [query, setQuery] = useState("");
  const listId = useId();
  const manualId = useId();
  const ru = locale === "ru";
  const options = MOLDOVA_PRIMARY_LOCALITIES.map(([value, labelRu, labelRo]) => ({
    code: value,
    label: locale === "ru" ? labelRu : labelRo,
  }));

  return <div className="sm:col-span-1">
    <label className="block text-sm font-medium text-zinc-800" htmlFor={`${listId}-input`}>
      {ru ? "Город / населённый пункт" : "Oraș / localitate"}
      {code !== OTHER_LOCALITY_CODE ? <span className="relative mt-1 block">
        <input
          aria-autocomplete="list"
          autoComplete="off"
          className={`${inputClass} appearance-none pr-10 [&::-webkit-calendar-picker-indicator]:opacity-0`}
          id={`${listId}-input`}
          list={listId}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            setCode(options.find((option) => option.label === value)?.code ?? "");
          }}
          placeholder={ru ? "Начните вводить город" : "Introduceți localitatea"}
          required
          value={query}
        />
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
      </span> : null}
      <datalist id={listId}>{options.map((option) => <option key={option.code} value={option.label} />)}</datalist>
    </label>
    <input name="localityCode" type="hidden" value={code} />
    <button className="mt-2 min-h-11 text-sm font-semibold text-blue-700 hover:text-blue-900" onClick={() => { setCode(code === OTHER_LOCALITY_CODE ? "" : OTHER_LOCALITY_CODE); setQuery(""); }} type="button">
      {code === OTHER_LOCALITY_CODE ? (ru ? "Выбрать из списка" : "Alegeți din listă") : (ru ? "Другой населённый пункт" : "Altă localitate")}
    </button>
    {code === OTHER_LOCALITY_CODE ? <label className="mt-3 block text-sm font-medium text-zinc-800" htmlFor={manualId}>
      {ru ? "Укажите населённый пункт" : "Introduceți localitatea"}
      <input autoComplete="address-level2" className={`mt-1 ${inputClass}`} id={manualId} maxLength={120} minLength={2} name="localityManual" required />
    </label> : <input name="localityManual" type="hidden" value="" />}
  </div>;
}
