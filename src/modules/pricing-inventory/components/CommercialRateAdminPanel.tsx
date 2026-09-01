"use client";

import { CheckCircle2, CircleAlert, History, Info, ShieldCheck, Upload } from "lucide-react";
import { useActionState, type ReactNode } from "react";

import type { ActionResult } from "../../access-control/actions/action-result";
import { controlCommercialRateAction } from "../actions";
import type { CommercialRateAdminDto, CommercialRateAdminRowDto } from "../services";
import type { CommercialRateVerificationResult, CommercialRateVerificationStatus } from "../types";

const INITIAL_STATE: ActionResult<CommercialRateVerificationResult | null> = { success: true, errorCode: null, message: "", data: null };
const controlClass = "mt-1 h-10 w-full border border-zinc-300 px-3 tabular-nums";

export function CommercialRateAdminPanel({ data }: { data: CommercialRateAdminDto }) {
  return <div className="space-y-6">
    <div className="border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700"><div className="flex items-start gap-3"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-zinc-500" /><p>Коммерческие курсы проверяются вручную по данным 1С. Стандартный OData 1С не предоставляет конечный BCRU/RTL курс для автоматической публикации.</p></div></div>
    <div className="grid gap-5 xl:grid-cols-2">{data.rates.map((row) => <CommercialRateControl key={row.purpose} row={row} />)}</div>
    <HistorySection title="История проверок по 1С">{data.verificationHistory.length === 0 ? <Empty /> : data.verificationHistory.map((item) => <div className="border-b border-zinc-100 py-3 text-sm last:border-0" key={item.id}><div className="flex flex-wrap items-center justify-between gap-2"><strong>{purposeLabel(item.purpose)}</strong><VerificationBadge status={item.verificationStatus} /></div><p className="mt-1 text-zinc-600">Портал {formatRate(item.activePortalRate)} · 1С {formatRate(item.observed1cRate)} · {formatDateTime(item.verifiedAt)}</p><p className="text-zinc-500">{person(item.verifierName, item.verifierEmail)} · {item.evidenceNote}</p></div>)}</HistorySection>
    <HistorySection title="История публикаций в портал">{data.history.length === 0 ? <Empty /> : data.history.map((rate) => <div className="border-b border-zinc-100 py-3 text-sm last:border-0" key={rate.id}><div className="flex flex-wrap justify-between gap-2"><strong>{purposeLabel(rate.purpose)}</strong><span className="tabular-nums">{formatRate(rate.rate)}</span></div><p className="mt-1 text-zinc-500">{formatDateTime(rate.publishedAt)} · {person(rate.publisherName, rate.publisherEmail)}</p></div>)}</HistorySection>
  </div>;
}

function CommercialRateControl({ row }: { row: CommercialRateAdminRowDto }) {
  const [state, action, pending] = useActionState(controlCommercialRateAction, INITIAL_STATE);
  const verification = state.data?.verification ?? row.latestVerification;
  const portalRate = state.data?.rate ?? row.current;
  const difference = verification && portalRate ? verification.observed1cRate - portalRate.rate : 0;
  const verificationStatus: CommercialRateVerificationStatus = !verification || !portalRate
    ? "NOT_VERIFIED"
    : difference === 0
      ? "MATCHES_1C"
      : "DIFFERS_FROM_1C";
  const differs = verificationStatus === "DIFFERS_FROM_1C";
  return <section className="border border-zinc-200 bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-3"><div><h2 className="text-base font-semibold">{purposeDirection(row.purpose)}</h2><p className="mt-1 text-xs text-zinc-500">{purposeDescription(row.purpose)}</p></div><VerificationBadge prominent status={verificationStatus} /></div>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-zinc-200 py-4 text-sm"><Metric label="1С" value={verification ? formatRate(verification.observed1cRate) : "Не проверено"} prominent /><Metric label="Портал" value={portalRate ? formatRate(portalRate.rate) : "Не опубликован"} prominent /><Metric label="Разница" value={verification && portalRate ? formatSignedRate(difference) : "—"} /><div><dt className="text-xs text-zinc-500">Статус</dt><dd className="mt-1"><VerificationBadge prominent status={verificationStatus} /></dd></div><Metric label="Проверка 1С" value={verification ? formatDateTime(verification.verifiedAt) : "—"} /><Metric label="Проверил" value={verification ? person(verification.verifierName, verification.verifierEmail) : "—"} /></dl>
    <form action={action} className="mt-4 grid gap-4"><input name="purpose" type="hidden" value={row.purpose} /><input name="intent" type="hidden" value="publish" /><h3 className="text-sm font-semibold">Проверка по 1С</h3>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Наблюдаемый курс 1С"><input className={controlClass} defaultValue={verification?.observed1cRate ?? portalRate?.rate} inputMode="decimal" max="1000" min="0.00000001" name="observed1cRate" required step="0.00000001" /></Field><Field label="Дата курса в 1С"><input className={controlClass} defaultValue={verification?.observed1cEffectiveDate ?? portalRate?.effectiveAt.slice(0, 10) ?? today()} name="observed1cEffectiveDate" required type="date" /></Field></div>
      <Field label="Подтверждающие сведения"><textarea className="mt-1 min-h-20 w-full border border-zinc-300 px-3 py-2" defaultValue={verification?.evidenceNote ?? "Проверено в 1С вручную"} maxLength={500} minLength={3} name="evidenceNote" required /></Field>
      <Field label="Комментарий (необязательно)"><textarea className="mt-1 min-h-16 w-full border border-zinc-300 px-3 py-2" defaultValue={verification?.verificationComment ?? ""} maxLength={1000} name="verificationComment" /></Field>
      <div className="flex flex-wrap gap-3"><button className={`inline-flex min-h-11 items-center gap-2 px-4 text-sm font-semibold disabled:opacity-50 ${differs ? "bg-zinc-950 text-white hover:bg-zinc-800" : "border border-zinc-900 hover:bg-zinc-50"}`} disabled={pending} type="submit">{differs ? <Upload aria-hidden="true" className="size-4" /> : <ShieldCheck aria-hidden="true" className="size-4" />}{differs ? "Применить значение 1С" : "Перепроверить данные"}</button></div>
      {state.message ? <p className={state.success ? "text-sm text-emerald-700" : "text-sm text-rose-700"} role="status">{state.message}</p> : null}
    </form>
  </section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="text-sm font-medium">{label}{children}</label>; }
function Metric({ label, value, className = "", prominent = false }: { label: string; value: string; className?: string; prominent?: boolean }) { return <div className={className}><dt className="text-xs text-zinc-500">{label}</dt><dd className={`mt-1 font-semibold text-zinc-950 ${prominent ? "text-2xl tabular-nums" : ""}`}>{value}</dd></div>; }
function HistorySection({ title, children }: { title: string; children: ReactNode }) { return <section className="space-y-3"><div className="flex items-center gap-2"><History aria-hidden="true" className="size-4 text-zinc-700" /><h2 className="text-lg font-semibold">{title}</h2></div><div className="border border-zinc-200 bg-white px-4">{children}</div></section>; }
function Empty() { return <p className="py-4 text-sm text-zinc-500">Записей пока нет.</p>; }
function VerificationBadge({ status, prominent = false }: { status: CommercialRateVerificationStatus; prominent?: boolean }) { const bad = status === "DIFFERS_FROM_1C"; return <span className={`inline-flex items-center gap-1 font-semibold ${prominent ? "text-sm uppercase" : "text-xs"} ${bad ? "text-rose-700" : status === "NOT_VERIFIED" ? "text-zinc-500" : "text-emerald-700"}`}>{bad ? <CircleAlert aria-hidden="true" className="size-4" /> : status !== "NOT_VERIFIED" ? <CheckCircle2 aria-hidden="true" className="size-4" /> : null}{statusLabel(status)}</span>; }
function statusLabel(status: CommercialRateVerificationStatus) { return ({ NOT_VERIFIED: "Не проверено", MATCHES_1C: "Соответствует 1С", DIFFERS_FROM_1C: "Не соответствует 1С", VERIFIED_NO_CHANGE_REQUIRED: "Проверено вручную, изменений не требуется" })[status]; }
function purposeLabel(purpose: CommercialRateAdminRowDto["purpose"]) { return purpose === "partner_price_usd_to_mdl" ? "BCRU 113 · партнёрская USD → MDL" : "RTL 999 · розничная USD → MDL"; }
function purposeDirection(purpose: CommercialRateAdminRowDto["purpose"]) { return purpose === "partner_price_usd_to_mdl" ? "BCRU 113 · USD → MDL" : "RTL 999 · USD → MDL"; }
function purposeDescription(purpose: CommercialRateAdminRowDto["purpose"]) { return purpose === "partner_price_usd_to_mdl" ? "Коммерческий курс партнёрской цены" : "Коммерческий курс розничной цены"; }
function person(name: string | null, email: string | null) { return name || email || "Внутренний администратор"; }
function formatRate(rate: number) { return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 4, maximumFractionDigits: 8 }).format(rate); }
function formatSignedRate(rate: number) { const value = formatRate(Math.abs(rate)); return rate > 0 ? `+${value}` : rate < 0 ? `−${value}` : value; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("ru-MD", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Chisinau" }).format(new Date(value)); }
function today() { return new Date().toISOString().slice(0, 10); }
