"use client";

import { RefreshCw } from "lucide-react";
import { useActionState } from "react";

import type { ActionResult } from "../../access-control/actions/action-result";
import {
  recheckCartCommercialDataAction,
  type CartCommercialRecheckResult,
} from "../actions/cart.actions";

const initial: ActionResult<CartCommercialRecheckResult | null> = {
  success: true,
  errorCode: null,
  message: "",
  data: null,
};

export function CartCommercialRecheck() {
  const [state, action, pending] = useActionState(
    recheckCartCommercialDataAction,
    initial,
  );

  return (
    <form action={action} className="space-y-2">
      <button
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-wait disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        <RefreshCw aria-hidden="true" className={`size-4 ${pending ? "animate-spin" : ""}`} />
        {pending ? "Проверяем данные..." : "Перепроверить коммерческие данные"}
      </button>
      <p aria-live="polite" className="text-xs leading-5 text-zinc-600">
        {state.message}
      </p>
    </form>
  );
}
