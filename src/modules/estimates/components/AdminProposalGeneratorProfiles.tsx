"use client";

import { Save, Search, Unlink } from "lucide-react";
import { useState, useTransition } from "react";
import { ActionFeedback, actionClassName } from "../../platform-ui";
import { searchProposalGeneratorTargetsAction, updateProposalGeneratorProfileAction, updateProposalGeneratorServicePriceAction } from "../actions/proposal-generator.actions";
import type { GeneratorProfileAdminRow } from "../repositories";

type Target = { targetType: "catalog" | "service" | "external_nomenclature"; id: string; label: string; secondary: string | null };

export function AdminProposalGeneratorProfiles({ initialProfiles }: { initialProfiles: GeneratorProfileAdminRow[] }) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [selectedKey, setSelectedKey] = useState(initialProfiles[0]?.profileKey ?? "");
  const [query, setQuery] = useState(""); const [results, setResults] = useState<Target[]>([]);
  const [message, setMessage] = useState<string | null>(null); const [pending, startTransition] = useTransition();
  const selected = profiles.find((profile) => profile.profileKey === selectedKey);
  const search = () => startTransition(async () => { const result = await searchProposalGeneratorTargetsAction(query); setMessage(result.message); setResults(result.success ? result.data : []); });
  const update = (targetType: Target["targetType"] | "unresolved", targetId: string | null, label: string | null) => {
    if (!selected) return;
    startTransition(async () => {
      const result = await updateProposalGeneratorProfileAction({ profileKey: selected.profileKey, expectedVersion: selected.version, targetType, targetId });
      setMessage(result.message);
      if (result.success) setProfiles((current) => current.map((profile) => profile.profileKey === selected.profileKey ? { ...profile, version: result.data.version, resolution: targetType === "catalog" ? "catalog" : targetType === "service" ? "service" : targetType === "external_nomenclature" ? "shared_nomenclature" : "unresolved", resolvedId: targetId, resolvedLabel: label, defaultSellingUnitPrice: null, defaultSellingCurrencyCode: null, defaultSellingVatMode: null } : profile));
    });
  };
  return <section className="space-y-4 rounded-md border border-zinc-200 bg-white p-4">
    <div><h2 className="font-semibold">Настройки быстрого расчёта</h2><p className="mt-1 text-sm text-zinc-600">Только точные активные соответствия. Пустой профиль останется требованием для ручного выбора.</p></div>
    <div className="grid gap-3 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.2fr)]">
      <div className="max-h-80 overflow-y-auto rounded-md border border-zinc-200">{profiles.map((profile) => <button className={`block w-full border-b border-zinc-100 p-3 text-left text-sm ${selectedKey === profile.profileKey ? "bg-emerald-50" : ""}`} key={profile.profileKey} onClick={() => { setSelectedKey(profile.profileKey); setResults([]); setMessage(null); }} type="button"><strong>{profile.label}</strong><span className="mt-1 block text-xs text-zinc-500">{profile.profileKey} · {profile.unit} · v{profile.version} · {profile.isActive ? "активен" : "выключен"}</span><span className={`mt-1 block text-xs ${profile.resolvedId ? "text-emerald-700" : "text-amber-700"}`}>{profile.resolvedLabel ?? "Соответствие не настроено"}</span>{profile.defaultSellingUnitPrice != null && <span className="mt-1 block text-xs font-semibold text-zinc-700">{profile.defaultSellingUnitPrice.toFixed(2)} {profile.defaultSellingCurrencyCode} · {profile.defaultSellingVatMode === "included" ? "НДС включён" : "без НДС"}</span>}</button>)}</div>
      <div className="space-y-3"><div className="flex flex-col gap-2 sm:flex-row"><input aria-label="Поиск товара или номенклатуры" className="min-h-11 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="SKU, модель или название" value={query} /><button className={actionClassName.secondary} disabled={pending || query.trim().length < 2} onClick={search} type="button"><Search className="size-4" />Найти</button></div>
        <div className="space-y-2">{results.map((target) => <button className="block min-h-11 w-full rounded-md border border-zinc-200 p-3 text-left text-sm" key={`${target.targetType}-${target.id}`} onClick={() => update(target.targetType, target.id, target.label)} type="button"><strong>{target.label}</strong>{target.secondary && <span className="mt-1 block text-xs text-zinc-500">{target.secondary}</span>}<span className="mt-1 block text-xs text-emerald-700">{target.targetType === "catalog" ? "Каталог Novotech" : target.targetType === "service" ? "Управляемая услуга" : "Общая номенклатура"}</span></button>)}</div>
        {selected?.resolvedId && <button className={actionClassName.secondary} disabled={pending} onClick={() => update("unresolved", null, null)} type="button"><Unlink className="size-4" />Очистить соответствие</button>}
        {selected?.resolution === "service" && <ServicePriceEditor key={`${selected.profileKey}-${selected.version}`} onSaved={(version, price) => setProfiles((current) => current.map((profile) => profile.profileKey === selected.profileKey ? { ...profile, version, ...price } : profile))} profile={selected} />}
        {message && <ActionFeedback kind={message === "Соответствие сохранено." ? "success" : "error"} message={message} />}
      </div>
    </div>
  </section>;
}

function ServicePriceEditor({ profile, onSaved }: { profile: GeneratorProfileAdminRow; onSaved: (version: number, price: Pick<GeneratorProfileAdminRow, "defaultSellingUnitPrice" | "defaultSellingCurrencyCode" | "defaultSellingVatMode">) => void }) {
  const [price, setPrice] = useState(profile.defaultSellingUnitPrice?.toString() ?? "");
  const [currency, setCurrency] = useState(profile.defaultSellingCurrencyCode ?? "MDL");
  const [vatMode, setVatMode] = useState<"included" | "excluded">(profile.defaultSellingVatMode ?? "included");
  const [message, setMessage] = useState<string | null>(null); const [pending, startTransition] = useTransition();
  const save = (clear = false) => startTransition(async () => {
    const parsed = clear ? null : Number(price);
    const result = await updateProposalGeneratorServicePriceAction({
      profileKey: profile.profileKey, expectedVersion: profile.version, unitPrice: parsed,
      currencyCode: clear ? null : currency, vatMode: clear ? null : vatMode,
    });
    setMessage(result.message);
    if (result.success) onSaved(result.data.version, {
      defaultSellingUnitPrice: parsed, defaultSellingCurrencyCode: clear ? null : currency,
      defaultSellingVatMode: clear ? null : vatMode,
    });
  });
  return <div className="space-y-3 border-t border-zinc-200 pt-3"><div><h3 className="text-sm font-semibold">Цена услуги для быстрого расчёта</h3><p className="mt-1 text-xs text-zinc-500">Клиентская стартовая цена только для этого профиля. Она не меняет 1С или общую цену услуги.</p></div>
    <div className="grid gap-2 sm:grid-cols-3"><label className="text-xs font-medium text-zinc-600">Цена<input aria-label="Цена услуги для расчёта" className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3 text-sm" min="0.01" onChange={(event) => setPrice(event.target.value)} step="0.01" type="number" value={price} /></label><label className="text-xs font-medium text-zinc-600">Валюта<select aria-label="Валюта цены услуги" className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm" onChange={(event) => setCurrency(event.target.value)} value={currency}><option value="MDL">MDL</option><option value="USD">USD</option></select></label><label className="text-xs font-medium text-zinc-600">НДС<select aria-label="Режим НДС цены услуги" className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm" onChange={(event) => setVatMode(event.target.value as "included" | "excluded")} value={vatMode}><option value="included">НДС включён</option><option value="excluded">НДС не включён</option></select></label></div>
    <div className="flex flex-wrap gap-2"><button className={actionClassName.primary} disabled={pending || !Number.isFinite(Number(price)) || Number(price) <= 0} onClick={() => save()} type="button"><Save className="size-4" />Сохранить цену</button>{profile.defaultSellingUnitPrice != null && <button className={actionClassName.secondary} disabled={pending} onClick={() => save(true)} type="button">Очистить цену</button>}</div>
    {message && <ActionFeedback kind={message === "Цена для расчёта сохранена." ? "success" : "error"} message={message} />}
  </div>;
}
