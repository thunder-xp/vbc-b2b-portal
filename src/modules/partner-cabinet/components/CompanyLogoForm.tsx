"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useActionState } from "react";

import {
  type CompanyLogoActionState,
  updateCompanyLogoAction,
} from "../actions/company-logo.action";

const INITIAL_COMPANY_LOGO_STATE: CompanyLogoActionState = {
  status: "idle",
  message: null,
};

export function CompanyLogoForm({ hasLogo }: { hasLogo: boolean }) {
  const [state, action, pending] = useActionState(
    updateCompanyLogoAction,
    INITIAL_COMPANY_LOGO_STATE,
  );

  return (
    <form action={action} className="mt-5 space-y-3 border-t border-zinc-200 pt-5">
      <div>
        <h2 className="text-sm font-semibold text-zinc-950">Логотип компании</h2>
        <p className="mt-1 text-xs text-zinc-500">PNG, JPG или WEBP, до 2 МБ.</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          accept="image/png,image/jpeg,image/webp"
          className="min-h-11 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm file:mr-3 file:border-0 file:bg-transparent file:font-semibold"
          disabled={pending}
          name="logo"
          required
          type="file"
        />
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={pending} type="submit">
          <ImageUp aria-hidden="true" className="size-4" />
          {pending ? "Сохранение..." : "Загрузить"}
        </button>
        {hasLogo ? (
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 disabled:opacity-50" disabled={pending} formNoValidate name="intent" type="submit" value="remove">
            <Trash2 aria-hidden="true" className="size-4" />
            Удалить
          </button>
        ) : null}
      </div>
      {state.message ? (
        <p aria-live="polite" className={state.status === "error" ? "text-sm text-red-700" : "text-sm text-emerald-700"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
