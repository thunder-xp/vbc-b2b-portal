"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { synchronizeOwnFinanceCompanyAction } from "../actions";
import { getFinanceCopy, usePartnerLocale } from "../../partner-locale";

export function FinanceRefreshButton() {
  const copy = getFinanceCopy(usePartnerLocale());
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-50"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await synchronizeOwnFinanceCompanyAction();
            setMessage(result.success
              ? result.data.status === "zero_balance" ? copy.syncZero : copy.syncSuccess
              : result.errorCode === "CONFLICT" ? copy.syncLocked
                : result.errorCode === "INVALID_INPUT" ? copy.syncMappingMissing
                  : copy.syncFailed);
            if (result.success) router.refresh();
          })
        }
        type="button"
      >
        <RefreshCw
          aria-hidden="true"
          className={`size-4 ${pending ? "animate-spin" : ""}`}
        />
        {pending ? copy.refreshing : copy.refresh}
      </button>
      {message ? (
        <p
          aria-live="polite"
          className={`max-w-md text-xs ${message === copy.syncFailed || message === copy.syncMappingMissing ? "text-red-700" : "text-zinc-600"}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
