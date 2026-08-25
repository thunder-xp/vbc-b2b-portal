"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CompetitorOption } from "../types";
import { finalizeCompetitorRetailImportAction, prepareCompetitorRetailImportAction } from "../retail-pricing.actions";

export function AdminCompetitorRetailImportForm({ competitors }: { competitors: CompetitorOption[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ success: boolean; text: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget, formData = new FormData(form), file = formData.get("file");
    if (!(file instanceof File)) return;
    setPending(true); setMessage(null);
    try {
      const hash = await sha256(file);
      const prepared = await prepareCompetitorRetailImportAction({ filename: file.name, size: file.size, hash });
      if (!prepared.success) { setMessage({ success: false, text: prepared.message }); return; }
      const body = new FormData(); body.append("cacheControl", "3600"); body.append("", file);
      const uploaded = await fetch(prepared.data.signedUrl, { method: "PUT", headers: { "x-upsert": "false" }, body });
      if (!uploaded.ok) { setMessage({ success: false, text: "Не удалось загрузить файл." }); return; }
      formData.delete("file");
      formData.set("importId", prepared.data.importId); formData.set("storageKey", prepared.data.storageKey);
      formData.set("hash", hash); formData.set("originalFilename", file.name);
      const finalized = await finalizeCompetitorRetailImportAction(formData);
      setMessage({ success: finalized.success, text: finalized.message });
      if (finalized.success) { form.reset(); router.refresh(); }
    } catch {
      setMessage({ success: false, text: "Не удалось загрузить прайс-лист." });
    } finally { setPending(false); }
  }

  return <form className="grid gap-4 border-y border-zinc-200 py-5 md:grid-cols-2 xl:grid-cols-5" onSubmit={submit}>
    <Field label="Конкурент"><select className={control} name="competitorId" required>{competitors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
    <Field label="Прайс-лист"><input accept=".xlsx,.csv" className={control} name="file" required type="file" /></Field>
    <Field label="Дата действия"><input className={control} defaultValue={new Date().toISOString().slice(0, 10)} name="effectiveDate" required type="date" /></Field>
    <Field label="Валюта"><input className={control} defaultValue="USD" maxLength={3} name="currency" required /></Field>
    <Field label="Тип обновления"><select className={control} defaultValue="full" name="snapshotScope"><option value="full">Полный прайс-лист</option><option value="partial">Частичное обновление</option></select></Field>
    <p className="text-xs text-zinc-500 md:col-span-2 xl:col-span-5">Импортируется только розничная/list цена с включённым НДС. Индивидуальные цены партнёров сюда не загружаются.</p>
    {message ? <p className={`text-sm md:col-span-2 xl:col-span-5 ${message.success ? "text-emerald-700" : "text-red-700"}`} role="status">{message.text}</p> : null}
    <div className="md:col-span-2 xl:col-span-5"><button className="min-h-11 bg-zinc-950 px-5 text-sm font-semibold text-white disabled:opacity-50" disabled={pending || competitors.length === 0} type="submit">{pending ? "Загрузка..." : "Загрузить прайс-лист"}</button></div>
  </form>;
}

async function sha256(file: File) { const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer()); return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join(""); }
function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className="space-y-1.5 text-sm font-medium text-zinc-800"><span>{label}</span>{children}</label>; }
const control = "min-h-11 w-full min-w-0 border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
