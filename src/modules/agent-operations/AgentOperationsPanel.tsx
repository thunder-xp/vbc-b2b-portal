"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  bindAgentContractAction,
  bindAgentCounterpartyAction,
  bindAgentProjectAction,
  discoverAgentContractsAction,
  discoverAgentProjectsAction,
  requestAgentPasswordResetAction,
  verifyAgentCounterpartyAction,
} from "./actions";
import type { AgentContractCandidate, AgentOperationsDetail, AgentProjectCandidate } from "./types";

export function AgentOperationsPanel({ agentId, agentCode, canManage, detail }: { agentId: string; agentCode: string; canManage: boolean; detail: AgentOperationsDetail }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [contracts, setContracts] = useState<AgentContractCandidate[]>([]);
  const [projects, setProjects] = useState<AgentProjectCandidate[]>([]);
  const currentContract = detail.contracts.find((item) => item.isCurrent);
  const currentProject = detail.projects.find((item) => item.isCurrent);

  function execute(operation: () => Promise<{ ok: boolean; message: string }>) {
    start(async () => { const result = await operation(); setMessage({ ok: result.ok, text: result.message }); });
  }

  return <section className="space-y-4" aria-labelledby="agent-operations-title">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-xl font-semibold" id="agent-operations-title">Доступ, 1С и готовность</h2><p className="mt-1 text-sm text-zinc-600">Страница читает локальные снимки. Обращение к 1С выполняется только явной кнопкой.</p></div>
      <span className="rounded bg-zinc-100 px-2 py-1 font-mono text-sm">{agentCode}</span>
    </div>
    {message ? <p className={`rounded border px-3 py-2 text-sm ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`} role="status">{message.text}</p> : null}

    <div className="grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 lg:grid-cols-3">
      <FactGroup title="Auth" facts={[
        ["Учётная запись", detail.auth.linked ? "Связана" : "Не связана"],
        ["Email", detail.auth.emailConfirmed ? "Подтверждён" : "Не подтверждён"],
        ["Телефон Auth", detail.auth.phoneConfirmed ? "Подтверждён" : "Не подтверждён"],
        ["Quick Auth", detail.auth.quickAuthReady ? "READY" : "NOT CONFIGURED"],
        ["Последний вход", formatDate(detail.auth.lastSignInAt)],
      ]} />
      <FactGroup title="1С — контрагент" facts={detail.counterparty ? [
        ["Контрагент", detail.counterparty.name], ["Код 1С", detail.counterparty.externalCode],
        ["NSD код", `${detail.counterparty.codeState}${detail.counterparty.sourceAgentCode ? ` · ${detail.counterparty.sourceAgentCode}` : ""}`],
        ["Последняя проверка", formatDate(detail.counterparty.verifiedAt)],
      ] : [["Состояние", "MISSING"]]} />
      <FactGroup title="Готовность" facts={[
        ["CABINET_ACCESS_READY", detail.auth.linked ? "YES" : "NO"],
        ["AUTH_READY", detail.auth.emailConfirmed ? "YES" : "NO"],
        ["ONE_C_IDENTITY_READY", detail.counterparty?.codeState === "MATCH" ? "YES" : "NO"],
        ["ONE_C_CONTRACT_READY", currentContract?.codeState === "MATCH" ? "YES" : "NO"],
        ["ONE_C_PROJECT_READY", currentProject?.codeState === "MATCH" ? "YES" : "NO"],
      ]} />
    </div>

    {canManage ? <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="font-semibold">Доступ и безопасность</h3>
        <p className="mt-1 text-sm text-zinc-600">Admin отправляет обычную защищённую ссылку Supabase. Пароль и recovery token не доступны Admin.</p>
        <details className="mt-3 rounded border border-zinc-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Сбросить пароль</summary><p className="mt-2 text-sm text-zinc-600">Получатель: {maskEmail(detail.auth.email)}</p><label className="mt-3 flex gap-2 text-sm"><input id="confirm-agent-password-reset" type="checkbox"/>Подтверждаю отправку одной ссылки для смены пароля.</label><button className="mt-3 min-h-10 rounded bg-zinc-900 px-3 text-sm font-semibold text-white disabled:bg-zinc-400" disabled={pending || !detail.auth.emailConfirmed} onClick={() => { const box = document.querySelector<HTMLInputElement>("#confirm-agent-password-reset"); if (!box?.checked) { setMessage({ ok: false, text: "Подтвердите отправку ссылки." }); return; } execute(() => requestAgentPasswordResetAction(agentId)); }} type="button">Отправить ссылку</button></details>
        <p className="mt-3 text-xs text-zinc-500">Завершение активных сессий недоступно: отдельного управляемого механизма отзыва сессий по user_id в текущей Auth-инфраструктуре нет.</p>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="font-semibold">Контрагент 1С</h3>
        {detail.counterparty ? <div className="mt-3"><p className="text-sm">{detail.counterparty.name}</p><p className="mt-1 font-mono text-xs text-zinc-500">{detail.counterparty.reference}</p><button className="mt-3 min-h-10 rounded border border-zinc-300 px-3 text-sm font-semibold disabled:text-zinc-400" disabled={pending} onClick={() => execute(() => verifyAgentCounterpartyAction(agentId))} type="button">Проверить в 1С</button></div> : <div className="mt-3 space-y-2"><p className="text-sm text-zinc-600">Найдите локальный опубликованный справочник выше по точному коду, имени, fiscal ID или Ref_Key.</p>{detail.counterparties.map((item) => <article className="rounded border border-zinc-200 p-3" key={item.reference}><p className="font-medium">{item.name}</p><p className="text-xs text-zinc-500">{item.externalCode ?? "—"} · {item.fiscalCode ?? "—"}</p><button className="mt-2 min-h-9 rounded border border-zinc-300 px-3 text-sm font-semibold disabled:text-zinc-400" disabled={pending || !item.active || item.deleted} onClick={() => execute(() => bindAgentCounterpartyAction(agentId, item.reference))} type="button">Проверить и связать</button></article>)}</div>}
      </section>
    </div> : null}

    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Договор 1С</h3>{canManage && detail.counterparty ? <button className="min-h-9 rounded border border-zinc-300 px-3 text-sm font-semibold disabled:text-zinc-400" disabled={pending} onClick={() => start(async () => { const result = await discoverAgentContractsAction(agentId); setMessage({ ok: result.ok, text: result.message }); if (result.ok) setContracts(result.data); })} type="button">Найти в 1С</button> : null}</div>
        {currentContract ? <BindingLine primary={`${currentContract.number ?? "Без номера"} · ${currentContract.name}`} reference={currentContract.reference} state={currentContract.codeState} /> : <p className="mt-3 text-sm text-amber-800">{detail.contracts.length ? "Текущий договор отсутствует." : "MISSING / legacy-флаг показывается отдельно в обзоре."}</p>}
        <CandidateList candidates={contracts} pending={pending} render={(candidate) => <article className="rounded border border-zinc-200 p-3" key={candidate.reference}><BindingLine primary={`${candidate.number ?? "Без номера"} · ${candidate.name}`} reference={candidate.reference} state={candidate.codeState}/><p className="mt-1 text-xs text-zinc-500">{candidate.contractType} · {candidate.signed === null ? "подписание неизвестно" : candidate.signed ? "подписан" : "не подписан"}</p><BindButton disabled={pending || !candidate.active || candidate.deleted || candidate.codeState !== "MATCH"} onBind={(reason) => execute(() => bindAgentContractAction(agentId, candidate.reference, reason))}/></article>} />
      </section>
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Проект 1С</h3>{canManage && currentContract ? <button className="min-h-9 rounded border border-zinc-300 px-3 text-sm font-semibold disabled:text-zinc-400" disabled={pending} onClick={() => start(async () => { const result = await discoverAgentProjectsAction(agentId); setMessage({ ok: result.ok, text: result.message }); if (result.ok) setProjects(result.data); })} type="button">Найти в 1С</button> : null}</div>
        {currentProject ? <BindingLine primary={currentProject.name} reference={currentProject.reference} state={currentProject.codeState} /> : <p className="mt-3 text-sm text-amber-800">MISSING</p>}
        <CandidateList candidates={projects} pending={pending} render={(candidate) => <article className="rounded border border-zinc-200 p-3" key={candidate.reference}><BindingLine primary={candidate.name} reference={candidate.reference} state={candidate.codeState}/><p className="mt-1 text-xs text-zinc-500">Код: {candidate.code ?? "—"} · доказательство: {candidate.codeEvidence}</p><BindButton disabled={pending || !candidate.active || candidate.deleted || candidate.codeState !== "MATCH"} onBind={(reason) => execute(() => bindAgentProjectAction(agentId, candidate.reference, reason))}/></article>} />
      </section>
    </div>

    <details className="rounded-lg border border-zinc-200 bg-white"><summary className="cursor-pointer p-4 font-semibold">Аудит · {detail.events.length}</summary><ul className="divide-y divide-zinc-100">{detail.events.map((event) => <li className="grid gap-1 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]" key={event.id}><span>{event.type}</span><time className="text-zinc-500">{formatDate(event.createdAt)}</time></li>)}</ul></details>
  </section>;
}

function FactGroup({ title, facts }: { title: string; facts: string[][] }) { return <section className="bg-white p-4"><h3 className="text-sm font-semibold">{title}</h3><dl className="mt-3 space-y-2">{facts.map(([label, value]) => <div className="flex justify-between gap-4 text-sm" key={label}><dt className="text-zinc-500">{label}</dt><dd className="text-right font-medium">{value}</dd></div>)}</dl></section>; }
function BindingLine({ primary, reference, state }: { primary: string; reference: string; state: string }) { return <div className="mt-3"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{primary}</p><span className={state === "MATCH" ? "text-emerald-800" : "text-amber-800"}>{state}</span></div><p className="mt-1 break-all font-mono text-xs text-zinc-500">{reference}</p></div>; }
function CandidateList<T>({ candidates, render }: { candidates: T[]; pending: boolean; render: (candidate: T) => ReactNode }) { return candidates.length ? <div className="mt-3 space-y-2">{candidates.map(render)}</div> : null; }
function BindButton({ disabled, onBind }: { disabled: boolean; onBind: (reason: string | null) => void }) { const [reason, setReason] = useState(""); return <div className="mt-2 flex flex-wrap gap-2"><input className="h-9 min-w-0 flex-1 rounded border border-zinc-300 px-2 text-sm" onChange={(event) => setReason(event.target.value)} placeholder="Причина при замене текущей привязки" value={reason}/><button className="h-9 rounded bg-zinc-900 px-3 text-sm font-semibold text-white disabled:bg-zinc-300" disabled={disabled} onClick={() => onBind(reason.trim() || null)} type="button">Связать</button></div>; }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleString("ru-RU") : "—"; }
function maskEmail(value: string | null) { if (!value) return "—"; const [name, domain] = value.split("@"); return `${name?.slice(0, 2) ?? ""}***@${domain ?? "***"}`; }
