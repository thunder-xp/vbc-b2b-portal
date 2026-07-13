import Link from "next/link";

import type { ProjectSpecificationDetailDto } from "../services";
import { ProjectSpecificationStatus } from "../types";
import { SpecificationForm } from "./SpecificationForm";
import { SpecificationItemControls, SubmitSpecificationButton } from "./SpecificationItemActions";

export function SpecificationDetail({ specification }: { specification: ProjectSpecificationDetailDto }) {
  const isDraft = specification.status === ProjectSpecificationStatus.Draft;
  return <div className="space-y-6">
    <section className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><Link className="text-sm font-medium text-emerald-700" href="/cabinet/specifications">← Спецификации</Link><h1 className="mt-2 text-2xl font-semibold text-zinc-950">{specification.projectName}</h1><p className="mt-1 text-sm text-zinc-500">{specification.customerSiteName}</p></div><StatusBadge status={specification.status} /></section>
    {specification.reviewComment ? <section className="border-l-4 border-emerald-600 bg-emerald-50 px-5 py-4"><p className="text-xs font-semibold uppercase text-emerald-800">Ответ Novotech</p><p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">{specification.reviewComment}</p>{specification.revisionId ? <Link className="mt-3 inline-flex text-sm font-semibold text-emerald-800" href={`/cabinet/specifications/${specification.revisionId}`}>Открыть новую редакцию →</Link> : null}</section> : null}
    {isDraft ? <section className="rounded-lg border border-zinc-200 bg-white p-5"><h2 className="mb-4 text-base font-semibold">Данные проекта</h2><SpecificationForm specification={specification} /></section> : specification.description ? <p className="rounded-lg border border-zinc-200 bg-white p-5 text-sm text-zinc-600">{specification.description}</p> : null}
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white"><div className="border-b border-zinc-200 px-5 py-4"><h2 className="font-semibold">Оборудование</h2></div>{specification.lines.length ? <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Модель</th><th className="px-4 py-3">Количество</th><th className="px-4 py-3">Партнёрская</th><th className="px-4 py-3">Розница</th><th className="px-4 py-3">Наличие</th><th className="px-4 py-3">Поступление</th><th className="px-4 py-3">Итого</th></tr></thead><tbody className="divide-y divide-zinc-100">{specification.lines.map((line) => <tr key={line.id}><td className="px-4 py-4"><Link className="font-semibold text-zinc-950 hover:text-emerald-700" href={`/cabinet/catalog/${line.slug}`}>{line.productName}</Link><div className="mt-1 text-xs text-zinc-500">SKU {line.sku}</div></td><td className="px-4 py-4">{isDraft ? <SpecificationItemControls itemId={line.id} quantity={line.quantity} specificationId={specification.id} /> : line.quantity}</td><td className="px-4 py-4">{line.partnerUnitPrice ?? "Уточняется"}</td><td className="px-4 py-4">{line.retailUnitPrice ?? "Уточняется"}</td><td className="px-4 py-4">{line.availableStock === null ? "Уточняется" : line.availableStock}</td><td className="px-4 py-4">{line.nearestArrivalDate ? <><div>{line.nearestArrivalDate}</div><div className="text-xs text-zinc-500">{line.nearestArrivalQuantity ?? "—"} шт.</div></> : "—"}</td><td className="px-4 py-4"><div className="font-semibold">{line.partnerLineTotal ?? "—"}</div><div className="text-xs text-zinc-500">Розница: {line.retailLineTotal ?? "—"}</div></td></tr>)}</tbody></table></div> : <p className="px-5 py-10 text-center text-sm text-zinc-500">Добавьте оборудование из каталога ниже.</p>}</section>
    <SpecificationTotals totals={specification.totals} />
    {isDraft && <SubmitSpecificationButton disabled={!specification.lines.length} specificationId={specification.id} />}
  </div>;
}

function SpecificationTotals({ totals }: { totals: ProjectSpecificationDetailDto["totals"] }) {
  const values = [["Закупка партнёра", totals.partnerPurchaseTotal], ["Розничная сумма", totals.retailTotal], ["Потенциальная валовая прибыль", totals.potentialGrossProfit], ["Наценка", totals.markupPercentage]];
  return <section className="grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-2 xl:grid-cols-4">{values.map(([label, value]) => <div className="bg-white p-5" key={label}><p className="text-xs font-medium uppercase text-zinc-500">{label}</p><p className="mt-2 text-xl font-semibold text-zinc-950">{value ?? "Недоступно"}</p></div>)}</section>;
}

export function StatusBadge({ status }: { status: ProjectSpecificationStatus }) {
  const labels: Record<ProjectSpecificationStatus, string> = {
    [ProjectSpecificationStatus.Draft]: "Черновик",
    [ProjectSpecificationStatus.Submitted]: "Отправлена",
    [ProjectSpecificationStatus.UnderReview]: "На рассмотрении",
    [ProjectSpecificationStatus.Approved]: "Одобрена",
    [ProjectSpecificationStatus.ChangesRequested]: "Нужны изменения",
    [ProjectSpecificationStatus.Rejected]: "Отклонена",
  };
  const tone = status === ProjectSpecificationStatus.Draft
    ? "bg-amber-100 text-amber-800"
    : status === ProjectSpecificationStatus.Rejected
      ? "bg-red-100 text-red-800"
      : status === ProjectSpecificationStatus.ChangesRequested
        ? "bg-orange-100 text-orange-800"
        : "bg-emerald-100 text-emerald-800";
  return <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{labels[status]}</span>;
}
