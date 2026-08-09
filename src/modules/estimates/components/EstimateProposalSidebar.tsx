"use client";

import { Eye, FilePlus2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createEstimateVersionAction } from "../actions/lifecycle.actions";
import type { EstimateWorkflowDto } from "../types";

export function EstimateProposalSidebar({ workflow, revision, disabled = false }: { workflow: EstimateWorkflowDto; revision: number; disabled?: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const passedChecks = workflow.readiness.checks.filter((check) => check.passed).length;
  const checkCount = workflow.readiness.checks.length;
  const progress = checkCount ? Math.round((passedChecks / checkCount) * 100) : 100;
  const latestVersion = workflow.versions[0] ?? null;

  return <section aria-labelledby="proposal-readiness-title" className="border-t border-zinc-200 pt-5">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase text-emerald-700">КП</p><h2 className="mt-1 font-semibold text-zinc-950" id="proposal-readiness-title">Готовность предложения</h2></div>
      <span className="text-sm font-semibold text-zinc-700">{progress}%</span>
    </div>
    <div aria-label={`Готовность коммерческого предложения: ${progress}%`} className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-200" role="progressbar" aria-valuemax={100} aria-valuemin={0} aria-valuenow={progress}>
      <div className="h-full bg-emerald-600 transition-[width]" style={{ width: `${progress}%` }} />
    </div>
    {!workflow.readiness.ready ? <ul className="mt-3 space-y-1 text-xs text-amber-900">{workflow.readiness.checks.filter((check) => !check.passed).map((check) => <li key={check.label}>• {check.label}</li>)}</ul> : <p className="mt-3 text-xs text-emerald-800">Расчёт готов к подготовке предложения.</p>}

    <div className="mt-4 border-y border-zinc-200 py-3">
      <p className="text-xs text-zinc-500">Последняя версия</p>
      <p className="mt-1 text-sm font-semibold text-zinc-900">{latestVersion?.label ?? "Версий пока нет"}</p>
      {latestVersion ? <p className="mt-1 text-xs text-zinc-500">{latestVersion.statusLabel} · {latestVersion.total}</p> : null}
    </div>

    <div className="mt-4 grid gap-2">
      <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-500" href={latestVersion ? `/cabinet/estimates/${workflow.estimateId}/versions/${latestVersion.id}/preview` : `/cabinet/estimates/${workflow.estimateId}/preview`} prefetch={false}><Eye className="size-4" />Предпросмотр КП</Link>
      <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45" disabled={disabled || pending || !workflow.readiness.ready} onClick={() => startTransition(async () => {
        const result = await createEstimateVersionAction(workflow.estimateId, revision, "");
        setMessage(result.message);
        if (result.success) router.refresh();
      })} type="button"><FilePlus2 className="size-4" />{pending ? "Подготовка..." : "Подготовить КП"}</button>
    </div>
    {disabled ? <p className="mt-2 text-xs text-amber-800">Сохраните изменения перед подготовкой КП.</p> : null}
    {message ? <p aria-live="polite" className="mt-3 text-xs text-zinc-700">{message}</p> : null}
    <a className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold text-emerald-700" href="#proposal-versions">Версии и отправка</a>
  </section>;
}
