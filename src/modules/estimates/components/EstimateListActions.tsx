"use client";

import { Archive, Copy, Download, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { archiveEstimateAction } from "../actions/estimate.actions";
import { duplicateEstimateAction } from "../actions/lifecycle.actions";

const buttonClass = "inline-flex size-9 items-center justify-center border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45";

export function EstimateListActions({ estimateId, revision, archived, latestVersionId, latestPdfDocumentId }: {
  estimateId: string;
  revision: number;
  archived: boolean;
  latestVersionId: string | null;
  latestPdfDocumentId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
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

  return <div>
    <div className="flex items-center gap-1">
      <Link aria-label="Открыть смету" className={buttonClass} href={`/cabinet/estimates/${estimateId}`} prefetch={false}><ExternalLink className="size-4" /></Link>
      {latestPdfDocumentId ? <Link aria-label="Открыть последний PDF" className={buttonClass} href={`/api/estimates/documents/${latestPdfDocumentId}`}><Download className="size-4" /></Link> : latestVersionId ? <Link aria-label="Открыть последнюю версию" className={buttonClass} href={`/cabinet/estimates/${estimateId}/versions/${latestVersionId}/preview`} prefetch={false}><Download className="size-4" /></Link> : null}
      <button aria-label="Дублировать смету" className={buttonClass} disabled={pending} onClick={duplicate} type="button"><Copy className="size-4" /></button>
      {!archived && <button aria-label="Архивировать смету" className={buttonClass} disabled={pending} onClick={archive} type="button"><Archive className="size-4" /></button>}
    </div>
    {message && <span aria-live="polite" className="sr-only">{message}</span>}
  </div>;
}
