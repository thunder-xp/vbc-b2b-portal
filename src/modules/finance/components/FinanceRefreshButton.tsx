"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { synchronizeOwnFinanceCompanyAction } from "../actions";

export function FinanceRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-50"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const result = await synchronizeOwnFinanceCompanyAction();
          setMessage(result.message);
          if (result.success) router.refresh();
        })}
        type="button"
      >
        <RefreshCw aria-hidden="true" className={`size-4 ${pending ? "animate-spin" : ""}`} />
        {pending ? "Обновление..." : "Обновить из 1С"}
      </button>
      {message ? <p aria-live="polite" className={`max-w-md text-xs ${message.startsWith("Не удалось") ? "text-red-700" : "text-zinc-600"}`}>{message}</p> : null}
    </div>
  );
}
