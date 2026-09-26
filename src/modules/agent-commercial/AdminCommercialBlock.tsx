import {
  bindCommercialAgentOneCAction,
  classifyAgentNomenclatureAction,
  importAndLinkAgentSaleAction,
  linkAgentSaleAction,
  refreshAgentSaleAction,
  transitionAgentRewardAction,
} from "./actions";
import type { AgentCommercialAdminDetail, AgentRewardState, OneCAgentCandidate, OneCCommercialOrderCandidate } from "./types";

export function AdminCommercialBlock({
  agentId, detail, candidates, agentCandidate, canManage, canApprove, searchNumber, agentSearchReference,
}: {
  agentId: string;
  detail: AgentCommercialAdminDetail;
  candidates: OneCCommercialOrderCandidate[];
  agentCandidate: OneCAgentCandidate | null;
  canManage: boolean;
  canApprove: boolean;
  searchNumber: string;
  agentSearchReference: string;
}) {
  const activeAttributions = detail.attributions.filter((item) => item.status === "ACTIVE");
  return <section className="space-y-4">
    <div><h2 className="text-xl font-semibold">Коммерческие данные агента</h2><p className="mt-1 text-sm text-zinc-600">Проекция продаж и оплат из 1С. Расчёт не изменяет бухгалтерские данные.</p></div>

    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <h3 className="font-semibold">Привязка агента к 1С</h3>
      {detail.binding ? <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><Fact label="Контрагент" value={detail.binding.sourceNameSnapshot}/><Fact label="Код 1С" value={detail.binding.sourceExternalCode}/><Fact label="Фискальный код" value={detail.binding.sourceFiscalCode ?? "—"}/><Fact label="Ref_Key" value={detail.binding.sourceAgent1cId}/></dl> : canManage ? <div className="mt-3 space-y-3"><form className="flex gap-2" method="get"><input className="h-11 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 font-mono" defaultValue={agentSearchReference} name="agent1cRef" placeholder="Точный Ref_Key контрагента 1С" required/><button className="h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold" type="submit">Проверить в 1С</button></form>{agentCandidate ? <form action={bindCommercialAgentOneCAction} className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-4"><input name="agentId" type="hidden" value={agentId}/><input name="sourceReference" type="hidden" value={agentCandidate.reference}/><dl className="grid gap-2 text-sm sm:grid-cols-2"><Fact label="Контрагент" value={agentCandidate.name}/><Fact label="Код 1С" value={agentCandidate.code}/><Fact label="Фискальный код" value={agentCandidate.fiscalCode ?? "—"}/><Fact label="Ref_Key" value={agentCandidate.reference}/></dl><label className="flex items-start gap-2 text-sm"><input className="mt-1" name="confirmExact" required type="checkbox"/>Подтверждаю точного контрагента 1С, показанного выше.</label><button className="min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" type="submit">Связать с 1С</button></form> : null}</div> : <p className="mt-3 text-sm text-amber-800">Привязка отсутствует.</p>}
    </div>

    {canManage ? <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <h3 className="font-semibold">Связать с заказом 1С</h3>
      <form className="mt-3 flex gap-2" method="get"><input className="h-11 min-w-0 flex-1 rounded-md border border-zinc-300 px-3" defaultValue={searchNumber} name="orderNumber" placeholder="Номер заказа, например NS-002691"/><button className="h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold" type="submit">Найти</button></form>
      {searchNumber && candidates.length === 0 ? <p className="mt-3 text-sm text-zinc-600">Точные совпадения не найдены.</p> : null}
      <div className="mt-3 space-y-3">{candidates.map((candidate) => <article className="rounded-md border border-zinc-200 p-4" key={candidate.reference}><div className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4"><Fact label="Номер / дата" value={`${candidate.number} · ${new Date(candidate.date).toLocaleDateString("ru-RU")}`}/><Fact label="Клиент" value={`${candidate.customerName} · ${candidate.customerKind}`}/><Fact label="Сумма" value={`${candidate.grossAmount.toFixed(2)} ${candidate.currency}`}/><Fact label="Ref_Key" value={candidate.reference}/></div>{activeAttributions.length ? <form action={linkAgentSaleAction} className="mt-4 flex flex-wrap items-end gap-3"><input name="agentId" type="hidden" value={agentId}/><input name="orderReference" type="hidden" value={candidate.reference}/><label className="text-sm font-medium">Рекомендация<select className="mt-1 block h-11 rounded-md border border-zinc-300 px-3" name="attributionId" required>{activeAttributions.map((item) => <option key={item.id} value={item.id}>{item.referralCode} · {item.customerName}</option>)}</select></label><label className="flex items-center gap-2 pb-3 text-sm"><input name="confirmExact" required type="checkbox"/>Подтвердить Ref_Key</label><button className="h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" type="submit">Связать</button></form> : <form action={importAndLinkAgentSaleAction} className="mt-4 space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3"><input name="agentId" type="hidden" value={agentId}/><input name="orderReference" type="hidden" value={candidate.reference}/><p className="text-sm text-amber-950">Активной атрибуции нет. Создать управляемую рекомендацию из точного контрагента и заказа 1С, затем связать продажу.</p><label className="flex items-start gap-2 text-sm"><input className="mt-1" name="confirmExact" required type="checkbox"/>Подтверждаю историческую рекомендацию и точные Ref_Key заказа и клиента.</label><button className="h-11 rounded-md bg-amber-900 px-4 text-sm font-semibold text-white" type="submit">Создать рекомендацию и связать</button></form>}</article>)}</div>
    </div> : null}

    <div className="space-y-3"><h3 className="font-semibold">Связанные продажи и вознаграждения</h3>{detail.sales.map((sale) => <article className="rounded-lg border border-zinc-200 bg-white p-5" key={sale.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{sale.orderNumber} · {sale.customerName}</p><p className="mt-1 font-mono text-xs text-zinc-500">{sale.orderRef}</p><p className="mt-2 text-sm">Продажа: {sale.saleState ?? "LINKED"} · Оплата: {sale.paymentState ?? "—"} · Вознаграждение: {sale.rewardState ?? "—"}</p><p className="mt-1 text-lg font-semibold tabular-nums">{(sale.rewardAmount ?? 0).toFixed(2)} {sale.currency}</p></div>{canManage ? <form action={refreshAgentSaleAction}><input name="agentId" type="hidden" value={agentId}/><input name="saleLinkId" type="hidden" value={sale.id}/><button className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold" type="submit">Обновить из 1С</button></form> : null}</div>
        <dl className="mt-4 grid gap-2 rounded-md bg-zinc-50 p-3 text-sm sm:grid-cols-2 xl:grid-cols-4"><Fact label="Реализовано gross" value={`${sale.realizedGrossAmount.toFixed(2)} ${sale.currency}`}/><Fact label="НДС / net" value={`${sale.vatAmount.toFixed(2)} / ${sale.netRealizedAmount.toFixed(2)}`}/><Fact label="Оплачено" value={`${sale.paidGrossAmount.toFixed(2)} ${sale.currency}`}/><Fact label="Наблюдение 1С" value={sale.sourceObservedAt ? new Date(sale.sourceObservedAt).toLocaleString("ru-RU") : "—"}/></dl>
        {sale.realizationEvidence.length || sale.paymentEvidence.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <EvidenceList currency={sale.currency} items={sale.realizationEvidence.map((item) => ({ key: item.ref, label: item.type === "WORK_ACT" ? "Акт выполненных работ" : "Расходная накладная", number: item.number, date: item.date, reference: item.ref, amount: item.amount }))} title="Документы реализации"/>
          <EvidenceList currency={sale.currency} items={sale.paymentEvidence.map((item) => ({ key: item.ref, label: item.type === "CASH" ? "Поступление в кассу" : "Поступление на счёт", number: item.number, date: item.date, reference: item.ref, amount: item.allocatedAmount }))} title="Документы оплаты"/>
        </div> : null}
        {sale.lines.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-zinc-500"><th className="py-2">Номенклатура</th><th className="py-2">Net</th><th className="py-2">Классификация</th></tr></thead><tbody>{sale.lines.map((line) => <tr className="border-b border-zinc-100" key={line.lineRef}><td className="py-3"><span className="block">{line.name}</span><span className="font-mono text-xs text-zinc-400">{line.nomenclatureRef}</span></td><td className="py-3 tabular-nums">{line.netAmount.toFixed(2)}</td><td className="py-3">{line.classificationStatus === "CLASSIFIED" ? line.classification : canManage ? <form action={classifyAgentNomenclatureAction} className="flex flex-wrap gap-2"><input name="agentId" type="hidden" value={agentId}/><input name="reference" type="hidden" value={line.nomenclatureRef}/><input name="name" type="hidden" value={line.name}/><select className="h-9 rounded-md border border-zinc-300 px-2" name="classification"><option value="EQUIPMENT">EQUIPMENT</option><option value="NOVOTECH_INSTALLATION">NOVOTECH_INSTALLATION</option><option value="EXCLUDED">EXCLUDED</option></select><button className="h-9 rounded-md border border-zinc-300 px-3 font-semibold" type="submit">Сохранить</button></form> : "BLOCKED_FROM_CALCULATION"}</td></tr>)}</tbody></table></div> : null}
        {canApprove && sale.rewardState ? <RewardActions agentId={agentId} saleLinkId={sale.id} state={sale.rewardState}/> : null}
      </article>)}{detail.sales.length === 0 ? <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-600">Связанных продаж пока нет.</p> : null}</div>
  </section>;
}

function RewardActions({ agentId, saleLinkId, state }: { agentId: string; saleLinkId: string; state: AgentRewardState }) {
  const targets: Partial<Record<AgentRewardState, AgentRewardState[]>> = { ELIGIBLE: ["FINANCE_REVIEW"], FINANCE_REVIEW: ["APPROVED", "BLOCKED"], APPROVED: ["READY_FOR_PAYOUT", "ADJUSTED"], READY_FOR_PAYOUT: ["ADJUSTED"], PAID: ["ADJUSTED"] };
  const available = targets[state] ?? [];
  return available.length ? <form action={transitionAgentRewardAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-4"><input name="agentId" type="hidden" value={agentId}/><input name="saleLinkId" type="hidden" value={saleLinkId}/><select className="h-10 rounded-md border border-zinc-300 px-3 text-sm" name="targetState">{available.map((target) => <option key={target} value={target}>{target}</option>)}</select><input className="h-10 min-w-64 rounded-md border border-zinc-300 px-3 text-sm" maxLength={1000} name="reason" placeholder="Основание решения"/><button className="h-10 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white" type="submit">Применить</button></form> : null;
}

function Fact({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs uppercase text-zinc-500">{label}</dt><dd className="mt-1 break-all font-medium">{value}</dd></div>; }

function EvidenceList({ title, currency, items }: { title: string; currency: string; items: Array<{ key: string; label: string; number: string; date: string; reference: string; amount: number }> }) {
  return <section className="rounded-md border border-zinc-200 p-3"><h4 className="text-sm font-semibold">{title}</h4>{items.length ? <ul className="mt-2 space-y-2">{items.map((item) => <li className="text-sm" key={item.key}><span className="font-medium">{item.label} {item.number || "—"}</span><span className="ml-2 tabular-nums">{item.amount.toFixed(2)} {currency}</span><span className="block text-xs text-zinc-500">{new Date(item.date).toLocaleString("ru-RU")} · {item.reference}</span></li>)}</ul> : <p className="mt-2 text-sm text-zinc-500">Нет подтверждённых документов.</p>}</section>;
}
