"use client";

import { Search, Unlink } from "lucide-react";
import { useState, useTransition } from "react";
import { ActionFeedback, actionClassName } from "../../platform-ui";
import { searchProposalGeneratorTargetsAction, updateProposalGeneratorProfileAction } from "../actions/proposal-generator.actions";
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
      if (result.success) setProfiles((current) => current.map((profile) => profile.profileKey === selected.profileKey ? { ...profile, version: result.data.version, resolution: targetType === "catalog" ? "catalog" : targetType === "service" ? "service" : targetType === "external_nomenclature" ? "shared_nomenclature" : "unresolved", resolvedId: targetId, resolvedLabel: label } : profile));
    });
  };
  return <section className="space-y-4 rounded-md border border-zinc-200 bg-white p-4">
    <div><h2 className="font-semibold">Настройки быстрого расчёта</h2><p className="mt-1 text-sm text-zinc-600">Только точные активные соответствия. Пустой профиль останется требованием для ручного выбора.</p></div>
    <div className="grid gap-3 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.2fr)]">
      <div className="max-h-80 overflow-y-auto rounded-md border border-zinc-200">{profiles.map((profile) => <button className={`block w-full border-b border-zinc-100 p-3 text-left text-sm ${selectedKey === profile.profileKey ? "bg-emerald-50" : ""}`} key={profile.profileKey} onClick={() => { setSelectedKey(profile.profileKey); setResults([]); setMessage(null); }} type="button"><strong>{profile.label}</strong><span className="mt-1 block text-xs text-zinc-500">{profile.profileKey}</span><span className={`mt-1 block text-xs ${profile.resolvedId ? "text-emerald-700" : "text-amber-700"}`}>{profile.resolvedLabel ?? "Соответствие не настроено"}</span></button>)}</div>
      <div className="space-y-3"><div className="flex flex-col gap-2 sm:flex-row"><input aria-label="Поиск товара или номенклатуры" className="min-h-11 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="SKU, модель или название" value={query} /><button className={actionClassName.secondary} disabled={pending || query.trim().length < 2} onClick={search} type="button"><Search className="size-4" />Найти</button></div>
        <div className="space-y-2">{results.map((target) => <button className="block min-h-11 w-full rounded-md border border-zinc-200 p-3 text-left text-sm" key={`${target.targetType}-${target.id}`} onClick={() => update(target.targetType, target.id, target.label)} type="button"><strong>{target.label}</strong>{target.secondary && <span className="mt-1 block text-xs text-zinc-500">{target.secondary}</span>}<span className="mt-1 block text-xs text-emerald-700">{target.targetType === "catalog" ? "Каталог Novotech" : target.targetType === "service" ? "Управляемая услуга" : "Общая номенклатура"}</span></button>)}</div>
        {selected?.resolvedId && <button className={actionClassName.secondary} disabled={pending} onClick={() => update("unresolved", null, null)} type="button"><Unlink className="size-4" />Очистить соответствие</button>}
        {message && <ActionFeedback kind={message === "Соответствие сохранено." ? "success" : "error"} message={message} />}
      </div>
    </div>
  </section>;
}
