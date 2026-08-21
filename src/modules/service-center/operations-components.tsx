"use client";
import Link from "next/link";
import { useActionState } from "react";
import {
  serviceFormCopy,
  usePartnerLocale,
} from "@/src/modules/partner-locale";
import { performPartnerServiceAction } from "./actions";
import {
  type ServiceAdminAttentionItem,
  type ServiceCaseDetail,
} from "./types";

const initial = {
  success: true as const,
  errorCode: null,
  message: "",
  data: null,
};
export function PartnerServiceActions({
  detail,
}: {
  detail: ServiceCaseDetail;
}) {
  const copy = serviceFormCopy(usePartnerLocale());
  const [state, action, pending] = useActionState(
    performPartnerServiceAction,
    initial,
  );
  const actions: Array<{ value: string; label: string; needsMessage: boolean }> =
    detail.status === "awaiting_information"
      ? [
          {
            value: "provide_information",
            label: copy.provideInformation,
            needsMessage: true,
          },
        ]
      : detail.status === "awaiting_equipment"
        ? [
            {
              value: "confirm_equipment_sent",
              label: copy.confirmTransfer,
              needsMessage: false,
            },
          ]
        : [];
  if (
    [
      "created",
      "accepted",
      "awaiting_equipment",
      "awaiting_information",
    ].includes(detail.status)
  )
    actions.push({ value: "cancel", label: copy.cancel, needsMessage: false });
  if (!actions.length) return null;
  return (
    <section className="border-t border-zinc-200 pt-6">
      <h2 className="text-lg font-semibold">{copy.availableActions}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {actions.map((item) => (
          <form
            action={action}
            className="rounded-md border border-zinc-200 p-4"
            key={item.value}
          >
            <input name="caseId" type="hidden" value={detail.id} />
            <input
              name="expectedVersion"
              type="hidden"
              value={detail.version}
            />
            <input name="partnerAction" type="hidden" value={item.value} />
            {item.needsMessage ? (
              <label className="grid gap-1.5 text-sm font-medium">
                {copy.additional}
                <textarea
                  className="min-h-24 rounded-md border border-zinc-300 p-3"
                  maxLength={4000}
                  name="message"
                  required
                />
              </label>
            ) : null}
            <button
              className="mt-3 min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
              disabled={pending}
            >
              {pending ? copy.saving : item.label}
            </button>
          </form>
        ))}
      </div>
      {state.message ? (
        <p aria-live="polite" className="mt-3 text-sm text-zinc-700">
          {state.success ? state.message : copy.actionError}
        </p>
      ) : null}
    </section>
  );
}
export function AdminServiceAttention({
  items,
}: {
  items: ServiceAdminAttentionItem[];
}) {
  if (!items.length) return null;
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Сервис требует внимания</h2>
        <Link
          className="text-sm font-semibold text-emerald-700"
          href="/admin/service"
        >
          Очередь
        </Link>
      </div>
      <div className="mt-4 divide-y divide-zinc-100">
        {items.map((item) => (
          <Link
            className="block min-h-11 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            href={item.actionUrl}
            key={item.id}
          >
            <span className="font-medium">{item.title}</span>
            <span className="ml-2 text-sm text-zinc-500">
              {item.caseNumber}
            </span>
            <p className="mt-1 text-sm text-zinc-600">{item.message}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
