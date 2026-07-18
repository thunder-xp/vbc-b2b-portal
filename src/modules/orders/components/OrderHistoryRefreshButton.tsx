"use client";

import { RefreshCw } from "lucide-react";
import { useActionState } from "react";

import type { ActionResult } from "../../access-control/actions/action-result";
import { refreshPartnerOrderHistoryAction } from "../actions/order.actions";
import type { PartnerOrderHistorySyncResult } from "../services";

const initialState: ActionResult<PartnerOrderHistorySyncResult | null> = {
  success: true,
  errorCode: null,
  message: "",
  data: null,
};

export function OrderHistoryRefreshButton() {
  const [state, action, pending] = useActionState(async () => refreshPartnerOrderHistoryAction(), initialState);
  return (
    <div className="flex flex-col items-end gap-2">
      <form action={action}>
        <button
          className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          <RefreshCw aria-hidden="true" className={pending ? "size-4 animate-spin" : "size-4"} />
          {pending ? "Обновление..." : "Обновить из 1С"}
        </button>
      </form>
      {state.message ? (
        <p className={state.success ? "text-xs text-emerald-700" : "text-xs text-rose-700"} role="status">
          {state.success ? state.message : "Не удалось обновить историю. Ранее загруженные данные сохранены."}
        </p>
      ) : null}
    </div>
  );
}
