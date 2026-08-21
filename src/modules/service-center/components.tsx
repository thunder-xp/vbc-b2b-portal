"use client";
import { useActionState, useState } from "react";
import {
  formatPartnerDate,
  serviceFormCopy,
  serviceTypeLabel,
  usePartnerLocale,
} from "@/src/modules/partner-locale";
import { KnowledgeSuggestions } from "../knowledge-base";
import {
  createServiceCaseAction,
  addServiceMessageAction,
  transitionServiceCaseAction,
} from "./actions";
import {
  SERVICE_CASE_TYPES,
  SERVICE_STATUS_LABELS,
  SERVICE_STATUSES,
  type ServiceCaseDetail,
  type ServiceSelectionData,
} from "./types";
import type { PartnerWarrantyLookup } from "../warranty-serials/types";

const initial = {
  success: true as const,
  errorCode: null,
  message: "",
  data: null,
};
const field =
  "min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
export function ServiceCaseForm({
  selections,
  verification = null,
}: {
  selections: ServiceSelectionData;
  verification?: PartnerWarrantyLookup | null;
}) {
  const [state, action, pending] = useActionState(
    createServiceCaseAction,
    initial,
  );
  const locale = usePartnerLocale();
  const copy = serviceFormCopy(locale);
  const [description, setDescription] = useState("");
  return (
    <form action={action} className="space-y-5" noValidate>
      {verification ? (
        <input
          name="warrantyVerificationId"
          type="hidden"
          value={verification.verificationId}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={copy.caseType}>
          <select className={field} name="caseType" required>
            {SERVICE_CASE_TYPES.map((value) => (
              <option key={value} value={value}>
                {serviceTypeLabel(locale, value)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={copy.order}>
          <select className={field} name="orderId">
            <option value="">{copy.noOrder}</option>
            {selections.orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.number} · {formatPartnerDate(order.date, locale)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={copy.product}>
          {verification ? (
            <>
              <input
                name="productId"
                type="hidden"
                value={verification.productId ?? ""}
              />
              <p className="min-h-11 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                {verification.sku} · {verification.productName}
              </p>
            </>
          ) : (
            <select className={field} name="productId">
              <option value="">{copy.productPending}</option>
              {selections.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} · {product.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={copy.orderLine}>
          <select className={field} name="orderLineId">
            <option value="">{copy.notSelected}</option>
            {selections.orders.flatMap((order) =>
              order.lines.map((line) => (
                <option key={line.id} value={line.id}>
                  {order.number} · {line.sku ?? copy.noSku} ·{" "}
                  {line.name ?? copy.oneCProduct}
                </option>
              )),
            )}
          </select>
        </Field>
        <Field label={copy.serial}>
          {verification ? (
            <p className="min-h-11 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
              {verification.maskedSerial}
            </p>
          ) : (
            <input
              className={field}
              maxLength={120}
              name="enteredSerial"
              placeholder={copy.serialPlaceholder}
            />
          )}
        </Field>
        <Field label={copy.faultCategory}>
          <input
            className={field}
            maxLength={100}
            name="faultCategory"
            required
          />
        </Field>
        <Field label={copy.issueStarted}>
          <input className={field} name="issueStartedOn" type="date" />
        </Field>
        <Field label={copy.preferredContact}>
          <input className={field} maxLength={200} name="preferredContact" />
        </Field>
      </div>
      <Field label={copy.description}>
        <textarea
          className={`${field} min-h-28`}
          minLength={10}
          maxLength={4000}
          name="description"
          onChange={(event) => setDescription(event.target.value)}
          required
          value={description}
        />
      </Field>
      <KnowledgeSuggestions source="service" text={description} />
      <Field label={copy.symptoms}>
        <textarea
          className={`${field} min-h-20`}
          maxLength={2000}
          name="symptoms"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Choice label={copy.powersOn} name="powersOn" />
        <Choice label={copy.resetDone} name="factoryResetAttempted" />
      </div>
      <label className="flex min-h-11 items-start gap-3 text-sm text-zinc-700">
        <input
          className="mt-1 size-4"
          name="evidenceConsent"
          required
          type="checkbox"
        />
        {copy.consent}
      </label>
      <p className="text-sm text-zinc-600">{copy.warrantyHint}</p>
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
        {pending ? copy.sending : copy.create}
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
function Choice({ label, name }: { label: string; name: string }) {
  const copy = serviceFormCopy(usePartnerLocale());
  return (
    <Field label={label}>
      <select className={field} name={name}>
        <option value="">{copy.notProvided}</option>
        <option value="yes">{copy.yes}</option>
        <option value="no">{copy.no}</option>
      </select>
    </Field>
  );
}
export function PartnerServiceResponse({ caseId }: { caseId: string }) {
  const copy = serviceFormCopy(usePartnerLocale());
  const [state, action, pending] = useActionState(
    addServiceMessageAction,
    initial,
  );
  return (
    <form action={action} className="space-y-3">
      <input name="caseId" type="hidden" value={caseId} />
      <Field label={copy.additional}>
        <textarea
          className={`${field} min-h-24`}
          maxLength={4000}
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
export function InternalServiceTransition({
  detail,
}: {
  detail: ServiceCaseDetail;
}) {
  const [state, action, pending] = useActionState(
    transitionServiceCaseAction,
    initial,
  );
  return (
    <form action={action} className="space-y-4">
      <input name="caseId" type="hidden" value={detail.id} />
      <input name="expectedVersion" type="hidden" value={detail.version} />
      <Field label="Следующий статус">
        <select className={field} name="status" defaultValue="">
          {" "}
          <option disabled value="">
            Выберите статус
          </option>
          {SERVICE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {SERVICE_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Сообщение партнёру">
        <textarea
          className={`${field} min-h-20`}
          maxLength={4000}
          name="partnerMessage"
        />
      </Field>
      <Field label="Внутренняя заметка">
        <textarea
          className={`${field} min-h-20`}
          maxLength={4000}
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
