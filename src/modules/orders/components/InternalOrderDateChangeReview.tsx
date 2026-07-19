"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reviewOrderDateChangeAction } from "../actions/order-date-change.actions";

export function InternalOrderDateChangeReview({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const decide = (decision: "approved" | "rejected") => startTransition(async () => {
    const result = await reviewOrderDateChangeAction({ requestId, decision, comment });
    setMessage(result.message);
    if (result.success) router.refresh();
  });
  return <div className="space-y-2">
    <label className="block text-xs font-medium text-zinc-600">Комментарий<textarea className="mt-1 min-h-16 w-full rounded-md border border-zinc-300 p-2 text-sm" maxLength={1000} onChange={(event) => setComment(event.target.value)} value={comment} /></label>
    <div className="flex flex-wrap gap-2"><button className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={pending} onClick={() => decide("approved")} type="button">Одобрить</button><button className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 disabled:opacity-50" disabled={pending || !comment.trim()} onClick={() => decide("rejected")} type="button">Отклонить</button></div>
    {message && <p className="text-xs text-zinc-600" role="status">{message}</p>}
  </div>;
}
