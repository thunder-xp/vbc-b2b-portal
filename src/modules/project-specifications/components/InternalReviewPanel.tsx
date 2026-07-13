"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  decideSpecificationReviewAction,
  startSpecificationReviewAction,
} from "../actions";
import { ProjectSpecificationStatus } from "../types";

export function InternalReviewPanel({ specificationId, status }: {
  specificationId: string;
  status: ProjectSpecificationStatus;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (status === ProjectSpecificationStatus.Submitted) {
    return <section className="border-t border-zinc-200 pt-5"><button className="rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={pending} onClick={() => startTransition(async () => {
      const result = await startSpecificationReviewAction(specificationId);
      setMessage(result.message);
      if (result.success) router.refresh();
    })} type="button">Начать рассмотрение</button>{message ? <p className="mt-3 text-sm text-zinc-600">{message}</p> : null}</section>;
  }

  if (status !== ProjectSpecificationStatus.UnderReview) return null;

  const decide = (decision: ProjectSpecificationStatus.Approved | ProjectSpecificationStatus.ChangesRequested | ProjectSpecificationStatus.Rejected) => {
    startTransition(async () => {
      const result = await decideSpecificationReviewAction({ specificationId, status: decision, comment });
      setMessage(result.message);
      if (result.success) router.refresh();
    });
  };

  return <section className="space-y-4 border-t border-zinc-200 pt-5"><div><label className="text-sm font-semibold text-zinc-900" htmlFor="review-comment">Комментарий партнёру</label><textarea className="mt-2 min-h-28 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" id="review-comment" maxLength={2000} onChange={(event) => setComment(event.target.value)} placeholder="Объясните решение или необходимые изменения" value={comment} /></div><div className="flex flex-wrap gap-2"><button className="rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={pending || !comment.trim()} onClick={() => decide(ProjectSpecificationStatus.Approved)} type="button">Одобрить</button><button className="rounded-md border border-amber-400 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 disabled:opacity-50" disabled={pending || !comment.trim()} onClick={() => decide(ProjectSpecificationStatus.ChangesRequested)} type="button">Запросить изменения</button><button className="rounded-md border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 disabled:opacity-50" disabled={pending || !comment.trim()} onClick={() => decide(ProjectSpecificationStatus.Rejected)} type="button">Отклонить</button></div>{message ? <p className="text-sm text-zinc-600">{message}</p> : null}</section>;
}
