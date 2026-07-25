"use client";

import { useActionState } from "react";

import {
  reissueEmployeeInvitationAction,
  type CompanyUserMutationState,
} from "../../actions/company-users.actions";

const INITIAL_STATE: CompanyUserMutationState = {
  success: false,
  message: null,
  invitationUrl: null,
};

export function InvitationActions({
  companyId,
  invitationId,
}: {
  companyId?: string;
  invitationId: string;
}) {
  const [state, action, pending] = useActionState(
    reissueEmployeeInvitationAction,
    INITIAL_STATE,
  );

  return (
    <div className="grid gap-2">
      <form action={action}>
        {companyId ? <input name="companyId" type="hidden" value={companyId} /> : null}
        <input name="invitationId" type="hidden" value={invitationId} />
        <button className="text-xs font-semibold text-emerald-700 disabled:text-zinc-400" disabled={pending}>
          {pending ? "Обновляем..." : "Отправить новую ссылку"}
        </button>
      </form>
      {state.message ? <p className="text-xs text-zinc-600">{state.message}</p> : null}
      {state.invitationUrl ? (
        <input aria-label="Новая одноразовая ссылка" className="h-9 min-w-0 rounded border border-amber-300 bg-amber-50 px-2 font-mono text-[11px]" readOnly value={state.invitationUrl} />
      ) : null}
    </div>
  );
}
