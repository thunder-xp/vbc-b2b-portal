"use client";
import { useActionState, useState } from "react";
import {
  supportFormCopy,
  supportPriorityLabel,
  usePartnerLocale,
} from "@/src/modules/partner-locale";
import { KnowledgeSuggestions } from "../knowledge-base";
import {
  addSupportReplyAction,
  createSupportTicketAction,
  partnerSupportTransitionAction,
  transitionSupportTicketAction,
} from "./actions";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  type SupportAssignee,
  type SupportTicketDetail,
} from "./types";

const initial = {
  success: true as const,
  errorCode: null,
  message: "",
  data: null,
};
const field =
  "min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
export function SupportTicketForm({
  idempotencyKey,
}: {
  idempotencyKey: string;
}) {
  const locale = usePartnerLocale();
  const copy = supportFormCopy(locale);
  const [state, action, pending] = useActionState(
    createSupportTicketAction,
    initial,
  );
  const [description, setDescription] = useState("");
  return (
    <form action={action} className="space-y-5" noValidate>
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <Field label={copy.describe}>
        <textarea
          aria-describedby="support-description-help"
          aria-label={copy.describe}
          className={`${field} min-h-40 resize-y`}
          maxLength={5000}
          minLength={20}
          name="description"
          onChange={(event) => setDescription(event.target.value)}
          required
          value={description}
        />
        <span
          className="text-xs font-normal text-zinc-500"
          id="support-description-help"
        >
          {copy.descriptionHint}
        </span>
      </Field>
      <KnowledgeSuggestions source="support" text={description} />
      <Field label={copy.priority}>
        <select
          aria-describedby="support-priority-help"
          aria-label={copy.priority}
          className={field}
          defaultValue="medium"
          name="priority"
        >
          {SUPPORT_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {supportPriorityLabel(locale, value)}
            </option>
          ))}
        </select>
        <span
          className="text-xs font-normal text-zinc-500"
          id="support-priority-help"
        >
          {copy.priorityHint}
        </span>
      </Field>
      <div>
        <label className="grid gap-1.5 text-sm font-medium">
          {copy.attachmentOptional}
          <input
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            aria-label={copy.attachmentOptional}
            className="min-h-11 rounded-md border border-zinc-300 p-2"
            name="attachment"
            type="file"
          />
        </label>
        <p className="mt-1 text-xs text-zinc-500">{copy.attachmentHint}</p>
      </div>
      {state.message ? (
        <p
          aria-live="polite"
          className={
            state.success ? "text-sm text-emerald-700" : "text-sm text-rose-700"
          }
        >
          {state.success ? state.message : copy.actionError}
        </p>
      ) : null}
      <button
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? copy.sending : copy.sendTicket}
      </button>
    </form>
  );
}
export function SupportReplyForm({ detail }: { detail: SupportTicketDetail }) {
  const copy = supportFormCopy(usePartnerLocale());
  const [state, action, pending] = useActionState(
    addSupportReplyAction,
    initial,
  );
  return (
    <form action={action} className="space-y-3">
      <input name="ticketId" type="hidden" value={detail.id} />
      <input name="expectedVersion" type="hidden" value={detail.version} />
      <Field label={copy.additional}>
        <textarea
          className={`${field} min-h-24`}
          maxLength={5000}
          name="message"
          required
        />
      </Field>
      {state.message ? (
        <p aria-live="polite" className="text-sm text-zinc-700">
          {state.success ? state.message : copy.actionError}
        </p>
      ) : null}
      <button
        className="min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
        disabled={pending}
      >
        {copy.send}
      </button>
    </form>
  );
}
export function PartnerSupportActions({
  detail,
}: {
  detail: SupportTicketDetail;
}) {
  const copy = supportFormCopy(usePartnerLocale());
  const [state, action, pending] = useActionState(
    partnerSupportTransitionAction,
    initial,
  );
  const actions =
    detail.status === "solution_proposed"
      ? [
          ["confirm_solution", copy.confirmSolution],
          ["reopen", copy.moreHelp],
        ]
      : detail.status === "resolved"
        ? [["reopen", copy.reopen]]
        : ["new", "acknowledged", "waiting_for_partner"].includes(detail.status)
          ? [["cancel", copy.cancel]]
          : [];
  if (!actions.length) return null;
  return (
    <form action={action} className="flex flex-wrap gap-3">
      <input name="ticketId" type="hidden" value={detail.id} />
      <input name="expectedVersion" type="hidden" value={detail.version} />
      {actions.map(([value, label]) => (
        <button
          className="min-h-11 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
          disabled={pending}
          key={value}
          name="action"
          type="submit"
          value={value}
        >
          {label}
        </button>
      ))}
      {state.message ? (
        <p aria-live="polite" className="w-full text-sm text-zinc-700">
          {state.success ? state.message : copy.actionError}
        </p>
      ) : null}
    </form>
  );
}
export function InternalSupportTransition({
  detail,
  assignees,
}: {
  detail: SupportTicketDetail;
  assignees: SupportAssignee[];
}) {
  const [state, action, pending] = useActionState(
    transitionSupportTicketAction,
    initial,
  );
  return (
    <form action={action} className="space-y-4">
      <input name="ticketId" type="hidden" value={detail.id} />
      <input name="expectedVersion" type="hidden" value={detail.version} />
      <Field label="Исполнитель">
        <select
          className={field}
          defaultValue={detail.assignedInternalUserId ?? ""}
          name="assigneeId"
        >
          <option value="">Не назначен</option>
          {assignees.map((assignee) => (
            <option key={assignee.id} value={assignee.id}>
              {assignee.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Статус">
        <select className={field} defaultValue={detail.status} name="status">
          {SUPPORT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {SUPPORT_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Категория">
        <select
          className={field}
          defaultValue={detail.category ?? ""}
          name="category"
        >
          <option value="">Не классифицирована</option>
          {SUPPORT_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Эффективный приоритет">
        <select
          className={field}
          defaultValue={detail.effectivePriority}
          name="effectivePriority"
        >
          {SUPPORT_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {SUPPORT_PRIORITY_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Причина изменения приоритета">
        <input className={field} maxLength={1000} name="priorityReason" />
      </Field>
      <Field label="Ответ партнёру">
        <textarea
          className={`${field} min-h-24`}
          maxLength={5000}
          name="partnerReply"
        />
      </Field>
      <Field label="Внутренняя заметка">
        <textarea
          className={`${field} min-h-24`}
          maxLength={5000}
          name="internalNote"
        />
      </Field>
      {state.message ? (
        <p aria-live="polite" className="text-sm text-zinc-700">
          {state.message}
        </p>
      ) : null}
      <button
        className="min-h-11 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
        disabled={pending}
      >
        {pending ? "Сохранение..." : "Обновить заявку"}
      </button>
    </form>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
      {label}
      {children}
    </label>
  );
}
