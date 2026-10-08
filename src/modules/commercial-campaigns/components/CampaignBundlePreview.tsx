"use client";
import { useState, useTransition } from "react";
import { previewCampaignBundleAction } from "../actions/commercial-campaign.actions";
import type { CampaignCommercialSummary as Summary, CampaignCompanyOption, CampaignDraftInput } from "../types";
import { CampaignCommercialSummary } from "./CampaignCommercialSummary";

export function CampaignBundlePreview({ input, companies }: { input: CampaignDraftInput; companies: CampaignCompanyOption[] }) {
  const [companyId, setCompanyId] = useState(input.companyIds[0] ?? "");
  const [result, setResult] = useState<{ summary: Summary | null; fingerprint: string; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const fingerprint = JSON.stringify([input, companyId]);
  const candidates = input.audienceMode === "explicit_company" ? companies.filter(c => input.companyIds.includes(c.id)) : companies;
  return <section className="mt-4 rounded-md border border-zinc-200 p-3" aria-label="Коммерческий предпросмотр набора">
    <label className="grid gap-1 text-xs font-medium">Предпросмотр для компании<select className="min-h-10 rounded border px-2" value={companyId} onChange={e => setCompanyId(e.target.value)}><option value="">Выберите компанию</option>{candidates.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
    <button type="button" className="mt-3 min-h-10 rounded border px-3 text-xs font-semibold disabled:opacity-50" disabled={!companyId || pending} onClick={() => startTransition(async () => {
      const response = await previewCampaignBundleAction(input, companyId);
      setResult({ summary: response.success ? response.data : null, fingerprint, message: response.message });
    })}>{pending ? "Рассчитываем…" : "Рассчитать предпросмотр"}</button>
    {result?.fingerprint === fingerprint ? <div className="mt-3">{result.summary ? <CampaignCommercialSummary locale="ru" summary={result.summary} /> : <p className="text-xs" role="status">{result.message}</p>}</div> : null}
  </section>;
}
