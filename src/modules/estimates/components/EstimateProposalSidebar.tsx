"use client";

import { Eye, FilePlus2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { createEstimateVersionAction } from "../actions/lifecycle.actions";
import type { EstimateWorkflowDto } from "../types";
import { getEstimatesCopy, usePartnerLocale } from "../../partner-locale";

export function EstimateProposalSidebar({ workflow, revision, disabled = false, readiness = workflow.readiness }: { workflow: EstimateWorkflowDto; revision: number; disabled?: boolean; readiness?: EstimateWorkflowDto["readiness"] }) {
  const copy = getEstimatesCopy(usePartnerLocale());
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const submitting = useRef(false);
  const [pending, startTransition] = useTransition();
  const latestProposal = workflow.versions[0] ?? null;

  const blockers = readiness.checks.filter((check) => !check.passed);
  return <section aria-labelledby="proposal-actions-title" className="scroll-mt-24 border-t border-zinc-200 pt-5" id="estimate-proposal-actions">
    <h2 className="text-sm font-semibold text-zinc-950" id="proposal-actions-title">{copy.commercialProposal}</h2>
    {blockers.length ? <details className="mt-3 text-xs text-amber-900"><summary className="cursor-pointer font-medium">{copy.needsReview}: {blockers.length}</summary><ul className="mt-2 space-y-1">{blockers.map((check) => <li key={check.label}>• {check.label}</li>)}</ul></details> : null}

    <div className="mt-4 grid gap-2">
      <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-500" href={latestProposal ? `/cabinet/estimates/${workflow.estimateId}/versions/${latestProposal.id}/preview` : `/cabinet/estimates/${workflow.estimateId}/preview`} prefetch={false}><Eye className="size-4" />{copy.proposalPreview}</Link>
      <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45" disabled={disabled || pending || !readiness.ready} onClick={() => startTransition(async () => {
        if (submitting.current) return;
        submitting.current = true;
        try {
          const result = await createEstimateVersionAction(workflow.estimateId, revision, requestKey, "");
          setMessage(result.success ? copy.operationSucceeded : copy.operationFailed);
          if (result.success || result.errorCode === "ESTIMATE_VERSION_CONFLICT") {
            setRequestKey(crypto.randomUUID());
            router.refresh();
          }
        } finally {
          submitting.current = false;
        }
      })} type="button"><FilePlus2 className="size-4" />{pending ? copy.preparing : copy.prepareProposal}</button>
    </div>
    {disabled ? <p className="mt-2 text-xs text-amber-800">{copy.saveBeforeProposal}</p> : null}
    {message ? <p aria-live="polite" className="mt-3 text-xs text-zinc-700">{message}</p> : null}
  </section>;
}
