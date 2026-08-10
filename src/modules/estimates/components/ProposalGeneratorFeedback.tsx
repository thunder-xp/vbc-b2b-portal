"use client";

import { useState, useTransition } from "react";

import { submitProposalGeneratorFeedbackAction } from "../actions";

export function ProposalGeneratorFeedback({ sessionId }: { sessionId: string }) {
  const [visible, setVisible] = useState(true);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!visible) return null;
  const submit = (answer: "yes" | "partial" | "no") => startTransition(async () => {
    const result = await submitProposalGeneratorFeedbackAction({ sessionId, answer, comment });
    if (result.success) setVisible(false); else setMessage(result.message);
  });
  return <aside aria-label="Обратная связь о Генераторе КП" className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
    <p className="font-semibold text-zinc-950">Помог ли Генератор КП быстрее подготовить смету?</p>
    <div className="mt-3 flex flex-wrap gap-2">{(["yes", "partial", "no"] as const).map((answer) => <button className="min-h-11 rounded-md border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-900" disabled={pending} key={answer} onClick={() => submit(answer)} type="button">{{ yes: "Да", partial: "Частично", no: "Нет" }[answer]}</button>)}</div>
    <label className="mt-3 block text-sm font-medium text-zinc-700">Что стоит улучшить? <span className="font-normal text-zinc-500">Необязательно</span><textarea className="mt-1 min-h-20 w-full rounded-md border border-zinc-300 bg-white p-2 outline-none focus:border-emerald-600" maxLength={500} onChange={(event) => setComment(event.target.value)} value={comment} /></label>
    {message && <p className="mt-2 text-sm text-red-700">{message}</p>}
  </aside>;
}
