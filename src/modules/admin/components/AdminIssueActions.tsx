"use client";

import { Check, Clipboard, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { runAdminSyncAction } from "../actions";
import type { AdminSyncDomain } from "../types";

const RETRY_DOMAIN: Partial<Record<string, AdminSyncDomain>> = {
  catalog: "catalog",
  prices: "prices",
  stock: "stock",
  arrivals: "stock",
  rates: "rates",
  finance: "finance",
};

export function AdminIssueActions({
  canManage,
  domain,
  historyHref,
  issueId,
  technicalSummary,
}: {
  canManage: boolean;
  domain: string;
  historyHref: string;
  issueId: string;
  technicalSummary: string;
}) {
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const retryDomain = RETRY_DOMAIN[domain];

  function retry() {
    if (!retryDomain) return;
    startTransition(async () => {
      const result = await runAdminSyncAction(
        retryDomain,
        `Повторный запуск из операционной диагностики ${issueId}`,
      );
      setMessage(result.message);
    });
  }

  async function copy() {
    await navigator.clipboard.writeText(technicalSummary);
    setCopied(true);
  }

  return (
    <section aria-label="Доступные действия" className="flex flex-wrap gap-2 border border-zinc-200 bg-white p-4">
      {canManage && retryDomain ? (
        <button
          className="inline-flex min-h-11 items-center gap-2 border border-emerald-700 bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
          disabled={pending}
          onClick={retry}
          type="button"
        >
          <RefreshCw aria-hidden className="h-4 w-4" />
          {pending ? "Запуск…" : "Повторить"}
        </button>
      ) : null}
      <Link className="inline-flex min-h-11 items-center border border-zinc-300 px-4 text-sm font-semibold hover:border-emerald-600" href={historyHref} prefetch={false}>
        Открыть журнал
      </Link>
      <Link className="inline-flex min-h-11 items-center border border-zinc-300 px-4 text-sm font-semibold hover:border-emerald-600" href="/admin/integrations/1c-health" prefetch={false}>
        Открыть диагностику 1С
      </Link>
      <button className="inline-flex min-h-11 items-center gap-2 border border-zinc-300 px-4 text-sm font-semibold hover:border-emerald-600" onClick={copy} type="button">
        {copied ? <Check aria-hidden className="h-4 w-4" /> : <Clipboard aria-hidden className="h-4 w-4" />}
        {copied ? "Скопировано" : "Скопировать технические данные"}
      </button>
      {message ? <p aria-live="polite" className="basis-full text-sm text-zinc-700">{message}</p> : null}
      {!canManage && retryDomain ? <p className="basis-full text-xs text-zinc-500">Повторный запуск доступен только пользователям с правом управления интеграциями.</p> : null}
    </section>
  );
}
