"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { getExternalPricesCopy, usePartnerLocale } from "../../partner-locale";
import { finalizeExternalPriceUploadAction, prepareExternalPriceUploadAction } from "../actions";
import type { ExternalPriceSourceDto } from "../types";

export function ExternalPriceUploadForm({ sources }: { sources: ExternalPriceSourceDto[] }) {
  const locale = usePartnerLocale(), copy = getExternalPricesCopy(locale), router = useRouter();
  const [state, setState] = useState<{ success: boolean; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    if (!(file instanceof File)) return;
    setPending(true);
    setState(null);
    try {
      const hash = await sha256(file);
      const prepared = await prepareExternalPriceUploadAction({ filename: file.name, size: file.size, hash });
      if (!prepared.success) { setState(prepared); return; }
      const upload = await uploadToSignedUrl(prepared.data.signedUrl, file);
      if (!upload.ok) { setState({ success: false, message: "Не удалось загрузить файл. Повторите попытку." }); return; }
      formData.delete("file");
      formData.set("uploadId", prepared.data.uploadId);
      formData.set("storageKey", prepared.data.storageKey);
      formData.set("hash", hash);
      formData.set("originalFilename", file.name);
      const finalized = await finalizeExternalPriceUploadAction(formData);
      setState(finalized);
      if (finalized.success) { form.reset(); router.refresh(); }
    } catch {
      setState({ success: false, message: "Не удалось загрузить файл. Повторите попытку." });
    } finally {
      setPending(false);
    }
  }

  return <form className="grid gap-4 border-y border-zinc-200 bg-white py-5 md:grid-cols-2" onSubmit={submit}>
    <Field label={copy.source}><select className={control} name="sourceId" required>{sources.map(source => <option key={source.id} value={source.id}>{source.displayName}</option>)}</select></Field>
    <Field label={copy.file}><input accept=".xlsx,.csv" className={control} name="file" required type="file" /></Field>
    <Field label={copy.priceType}><select className={control} defaultValue="detect" name="priceSchema"><option value="partner">{copy.partnerPrice}</option><option value="retail">{copy.retailPrice}</option><option value="both">{copy.bothPrices}</option><option value="detect">{copy.detect}</option></select></Field>
    <Field label={copy.currency}><input className={control} defaultValue="USD" maxLength={3} name="currency" required /></Field>
    <Field label={copy.effectiveDate}><input className={control} name="effectiveDate" type="date" /></Field>
    <fieldset className="space-y-2"><legend className="text-sm font-medium text-zinc-800">{copy.fullSnapshot} / {copy.partialUpdate}</legend><label className="flex min-h-11 items-center gap-2 text-sm"><input defaultChecked name="snapshotScope" type="radio" value="full" />{copy.fullSnapshot}</label><label className="flex min-h-11 items-center gap-2 text-sm"><input name="snapshotScope" type="radio" value="partial" />{copy.partialUpdate}</label></fieldset>
    {state ? <p className={`text-sm md:col-span-2 ${state.success ? "text-emerald-700" : "text-red-700"}`} role="status">{state.message}</p> : null}
    <div className="md:col-span-2"><button className="min-h-11 bg-zinc-950 px-5 text-sm font-semibold text-white disabled:opacity-60" disabled={pending || !sources.length} type="submit">{pending ? copy.analyzing : copy.upload}</button></div>
  </form>;
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

export async function uploadToSignedUrl(signedUrl: string, file: File): Promise<Response> {
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);
  return fetch(signedUrl, { method: "PUT", headers: { "x-upsert": "false" }, body });
}

function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className="space-y-1.5 text-sm font-medium text-zinc-800"><span>{label}</span>{children}</label>; }
const control = "min-h-11 w-full border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
