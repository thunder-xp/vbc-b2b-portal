"use client";

import Image from "next/image";
import { useActionState, useState, useTransition } from "react";

import { previewYouTubeUrlAction, saveExpertiseVideoAction } from "./actions";
import type { AdminExpertiseVideo } from "./types";

export function AdminExpertiseVideoEditor({ video }: { video: AdminExpertiseVideo | null }) {
  const [state, action, pending] = useActionState(saveExpertiseVideoAction, { error: null });
  const [preview, setPreview] = useState(video ? { videoId: video.youtubeVideoId, canonicalUrl: video.youtubeUrl, thumbnailUrl: `https://i.ytimg.com/vi/${video.youtubeVideoId}/hqdefault.jpg` } : null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();
  return <form action={action} className="space-y-5 border border-zinc-200 bg-white p-5">
    <input name="id" type="hidden" value={video?.id ?? ""} /><input name="revision" type="hidden" value={video?.revision ?? ""} />
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Раздел"><select className={control} defaultValue={video?.section ?? "LAB"} name="section"><option value="LAB">Лаборатория Novotech</option><option value="ACADEMY">Академия Novotech</option></select></Field>
      <Field label="Порядок"><input className={control} defaultValue={video?.sortOrder ?? 100} min={0} max={10000} name="sortOrder" type="number" /></Field>
    </div>
    <Field label="Статус"><input className={`${control} bg-zinc-50`} readOnly value={video?.status ?? "DRAFT"} /></Field>
    <Field label="YouTube URL"><input className={control} defaultValue={video?.youtubeUrl ?? ""} name="youtubeUrl" onBlur={(event) => { const value = event.currentTarget.value; startPreview(async () => { const result = await previewYouTubeUrlAction(value); if (result.ok) { setPreview(result.data); setPreviewError(null); } else { setPreview(null); setPreviewError(result.error); } }); }} required type="url" /></Field>
    {previewError ? <p className="text-sm text-red-700">{previewError}</p> : null}
    {preview ? <div className="grid gap-4 border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-[160px_1fr]"><div className="relative aspect-video overflow-hidden"><Image alt="YouTube preview" fill sizes="160px" src={preview.thumbnailUrl} className="object-cover" /></div><div className="text-sm"><p><strong>Video ID:</strong> {preview.videoId}</p><a className="mt-2 block break-all text-emerald-700 underline" href={preview.canonicalUrl} rel="noreferrer" target="_blank">{preview.canonicalUrl}</a></div></div> : null}
    <div className="grid gap-4 md:grid-cols-2"><Field label="Название RU"><input className={control} defaultValue={video?.titleRu ?? ""} minLength={2} maxLength={180} name="titleRu" required /></Field><Field label="Название RO"><input className={control} defaultValue={video?.titleRo ?? ""} minLength={2} maxLength={180} name="titleRo" required /></Field></div>
    <div className="grid gap-4 md:grid-cols-2"><Field label="Описание RU"><textarea className={`${control} min-h-32 py-3`} defaultValue={video?.descriptionRu ?? ""} minLength={2} maxLength={1000} name="descriptionRu" required /></Field><Field label="Описание RO"><textarea className={`${control} min-h-32 py-3`} defaultValue={video?.descriptionRo ?? ""} minLength={2} maxLength={1000} name="descriptionRo" required /></Field></div>
    {state.error ? <p className="text-sm text-red-700" role="alert">{state.error}</p> : null}
    <button className="min-h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white disabled:opacity-50" disabled={pending || previewing} type="submit">{pending ? "Сохранение…" : "Сохранить"}</button>
  </form>;
}

const control = "min-h-11 w-full rounded-md border border-zinc-300 px-3 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-medium"><span className="mb-2 block">{label}</span>{children}</label>; }
