"use client";

import { Archive, Copy, Download, ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmationDialog } from "../../platform-ui";
import { archiveEstimateAction, deleteArchivedEstimateAction } from "../actions/estimate.actions";
import { duplicateEstimateAction } from "../actions/lifecycle.actions";

const buttonClass = "inline-flex size-9 items-center justify-center border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45";

export function EstimateListActions({ estimateId, revision, archived, latestPdfDocumentId }: {
  estimateId: string;
  revision: number;
  archived: boolean;
  latestPdfDocumentId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const duplicate = () => startTransition(async () => {
    const result = await duplicateEstimateAction(estimateId);
    setMessage(result.message);
    if (result.success) router.push(`/cabinet/estimates/${result.data.estimateId}`);
  });
  const archive = () => startTransition(async () => {
    const result = await archiveEstimateAction(estimateId, revision);
    setMessage(result.message);
    if (result.success) router.refresh();
  });
  const removeArchived = () => startTransition(async () => {
    const result = await deleteArchivedEstimateAction(estimateId, revision, crypto.randomUUID());
    setMessage(result.message);
    if (result.success) { setDeleteOpen(false); router.refresh(); }
  });

  return <div>
    <div className="flex items-center gap-1">
      <Link aria-label="Открыть смету" className={buttonClass} href={`/cabinet/estimates/${estimateId}`} prefetch={false}><ExternalLink className="size-4" /></Link>
      {latestPdfDocumentId ? <Link aria-label="Открыть последний PDF" className={buttonClass} href={`/api/estimates/documents/${latestPdfDocumentId}`}><Download className="size-4" /></Link> : null}
      <button aria-label="Дублировать смету" className={buttonClass} disabled={pending} onClick={duplicate} type="button"><Copy className="size-4" /></button>
      {!archived && <button aria-label="Архивировать смету" className={buttonClass} disabled={pending} onClick={archive} type="button"><Archive className="size-4" /></button>}
      {archived && <button aria-label="Удалить смету" className={`${buttonClass} text-red-700`} disabled={pending} onClick={() => setDeleteOpen(true)} type="button"><Trash2 className="size-4" /></button>}
    </div>
    {message && <span aria-live="polite" className="sr-only">{message}</span>}
    <ConfirmationDialog confirmLabel="Удалить" consequence="Смета исчезнет из архива. Защищённая история предложений и заказов не удаляется; связанные записи удалить нельзя." destructive onCancel={() => setDeleteOpen(false)} onConfirm={removeArchived} open={deleteOpen} pending={pending} title="Удалить архивную смету?" />
  </div>;
}
