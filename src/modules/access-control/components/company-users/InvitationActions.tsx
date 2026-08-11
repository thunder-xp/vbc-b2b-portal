"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useState } from "react";

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
  const [copied, setCopied] = useState(false);

  return (
    <div className="grid gap-2">
      <form action={action}>
        {companyId ? <input name="companyId" type="hidden" value={companyId} /> : null}
        <input name="invitationId" type="hidden" value={invitationId} />
        <button className="min-h-11 text-xs font-semibold text-emerald-700 disabled:text-zinc-400" disabled={pending}>
          {pending ? "Отправляем..." : "Отправить повторно"}
        </button>
      </form>
      {state.message ? <p className="text-xs text-zinc-600">{state.message}</p> : null}
      {state.invitationUrl ? (
        <button className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-zinc-700" onClick={async () => { await navigator.clipboard.writeText(state.invitationUrl!); setCopied(true); }} type="button">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Ссылка скопирована" : "Скопировать ссылку"}</button>
      ) : null}
    </div>
  );
}
