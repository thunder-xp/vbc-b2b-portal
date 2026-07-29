"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import { generateEstimateVersionPdfAction } from "../actions/proposal.actions";

export function VersionProposalControls({ estimateId, versionId, versionNumber }: { estimateId: string; versionId: string; versionNumber: number }) {
  const [message, setMessage] = useState<string | null>(null); const [pending, startTransition] = useTransition();
  return <div className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur print:hidden"><div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-2"><Link className={secondary} href={`/cabinet/estimates/${estimateId}`}>← К смете</Link><div className="flex items-center gap-3"><span className="text-sm font-semibold">Версия {versionNumber}</span><button className={primary} disabled={pending} onClick={() => startTransition(async () => { const result = await generateEstimateVersionPdfAction(versionId); setMessage(result.message); if (result.success && result.data.status === "ready") { recordBehaviorInteraction({ eventName: "proposal_pdf_generated", route: "/cabinet/estimates/version/preview", sourceSurface: "proposal_preview" }); window.location.assign(`/api/estimates/documents/${result.data.id}`); } })} type="button"><Download className="size-4" />{pending ? "Подготовка..." : "Скачать PDF"}</button></div></div>{message && <p aria-live="polite" className="mx-auto mt-2 max-w-[210mm] text-sm text-zinc-600">{message}</p>}</div>;
}
const primary = "inline-flex min-h-11 items-center justify-center gap-2 bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50";
const secondary = "inline-flex min-h-11 items-center justify-center border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700";
