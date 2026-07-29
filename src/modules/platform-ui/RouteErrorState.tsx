"use client";

import Link from "next/link";

import { actionClassName } from "./action-styles";

export function RouteErrorState({
  correlationId,
  escapeHref,
  escapeLabel,
  message,
  reset,
  title,
}: {
  correlationId?: string;
  escapeHref: string;
  escapeLabel: string;
  message: string;
  reset: () => void;
  title: string;
}) {
  return (
    <section className="border border-rose-200 bg-rose-50 p-6 text-center" role="alert">
      <h2 className="text-lg font-semibold text-rose-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-rose-800">{message}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button className={actionClassName.primary} onClick={reset} type="button">Повторить</button>
        <Link className={actionClassName.secondary} href={escapeHref}>{escapeLabel}</Link>
      </div>
      {correlationId ? <p className="mt-4 text-xs text-rose-700">Код обращения: {correlationId}</p> : null}
    </section>
  );
}
