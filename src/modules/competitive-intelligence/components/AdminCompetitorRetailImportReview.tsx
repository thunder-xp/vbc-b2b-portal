import {
  applyCompetitorRetailImportAction,
  archiveCompetitorRetailImportAction,
  confirmCompetitorRetailMappingAction,
} from "../retail-pricing.actions";
import type { AdminCompetitorRetailImportDetail } from "../types";
import { AdminCompetitorProductPicker } from "./AdminCompetitorProductPicker";

export function AdminCompetitorRetailImportReview({ canManage, detail, notice }: { canManage: boolean; detail: AdminCompetitorRetailImportDetail; notice?: string }) {
  const mapping = detail.confirmedMapping ?? detail.detectedMapping ?? {};
  return <div className="space-y-6">
    {notice === "price_conflict" ? <p className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="alert">Один товар Novotech сопоставлен с разными розничными ценами. Исключите лишнюю строку или выберите другое соответствие.</p> : null}
    {notice === "applied" ? <p className="border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">Розничная история импортирована.</p> : null}
    <section className="grid grid-cols-2 gap-px border border-zinc-200 bg-zinc-200 sm:grid-cols-3 xl:grid-cols-6">{[
      ["Строк", detail.candidateRows], ["Сопоставлено", detail.matchedRows], ["На проверке", detail.reviewRows],
      ["Без соответствия", detail.unmappedRows], ["Изменено", detail.changedRows], ["Без изменений", detail.unchangedRows],
    ].map(([label, value]) => <div className="bg-white p-3" key={label}><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>)}</section>
    {canManage && ["mapping_required", "ready_for_review"].includes(detail.status) ? <form action={confirmCompetitorRetailMappingAction} className="grid gap-3 border-y border-zinc-200 py-5 sm:grid-cols-2 lg:grid-cols-4">
      <input name="importId" type="hidden" value={detail.id} />
      <Column label="SKU конкурента" name="productCode" value={mapping.productCode} />
      <Column label="Название / модель" name="productName" required value={mapping.productName} />
      <Column label="Описание" name="description" value={mapping.description} />
      <Column label="Розничная цена" name="retailPrice" required value={mapping.retailPrice} />
      <p className="text-xs text-zinc-500 sm:col-span-2 lg:col-span-4">Колонка цены всегда трактуется как retail/list, НДС включён. Partner price и VAT-поля отсутствуют намеренно.</p>
      <div className="sm:col-span-2 lg:col-span-4"><button className="min-h-11 bg-zinc-950 px-5 text-sm font-semibold text-white">Подтвердить колонки и пересчитать</button></div>
    </form> : null}
    {detail.status === "uploaded" || detail.status === "analyzing" ? <p className="border-y border-zinc-200 py-5 text-sm text-zinc-600" role="status">Файл анализируется. Обновите страницу через несколько секунд.</p> : null}
    {detail.status === "failed" ? <p className="border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">Импорт не выполнен: {detail.safeErrorCode ?? "ANALYSIS_FAILED"}</p> : null}
    {detail.rows.length ? <section aria-labelledby="competitor-retail-rows"><h2 className="text-base font-semibold" id="competitor-retail-rows">Номенклатура конкурента</h2><div className="mt-3 space-y-2">{detail.rows.map((row) => <article className="grid min-w-0 gap-3 border border-zinc-200 p-3 text-sm lg:grid-cols-[minmax(0,2fr)_minmax(8rem,0.7fr)_minmax(0,2fr)] lg:items-center" key={row.id}><div className="min-w-0"><p className="font-semibold break-words">{row.name}</p><p className="text-xs text-zinc-500">{row.sku || "Без SKU"} · {row.model || "Без модели"} · {row.sheet}:{row.row}</p></div><p className="font-semibold tabular-nums">{money(row.price, row.currency)}</p><div className="min-w-0">{row.status === "mapped" ? <p className="font-semibold text-emerald-700">Сопоставлено с товаром Novotech</p> : row.status === "ignored" ? <p className="text-zinc-500">Строка исключена</p> : canManage ? <AdminCompetitorProductPicker importId={detail.id} rowId={row.id} suggestions={row.suggestions} /> : <p className="text-amber-800">Требуется сопоставление</p>}</div></article>)}</div></section> : null}
    {canManage ? <div className="flex flex-wrap gap-3">{detail.status === "ready_for_review" ? <form action={applyCompetitorRetailImportAction}><input name="importId" type="hidden" value={detail.id} /><button className="min-h-11 bg-zinc-950 px-5 text-sm font-semibold text-white disabled:opacity-50" disabled={detail.reviewRows > 0}>Импортировать retail-историю</button></form> : null}{!["applied", "archived"].includes(detail.status) ? <form action={archiveCompetitorRetailImportAction}><input name="importId" type="hidden" value={detail.id} /><button className="min-h-11 border border-zinc-300 px-5 text-sm font-semibold">Архивировать</button></form> : null}</div> : null}
  </div>;
}

function Column({ label, name, required = false, value }: { label: string; name: string; required?: boolean; value: unknown }) { return <label className="space-y-1 text-sm font-medium">{label}<input className="mt-1 min-h-11 w-full border border-zinc-300 px-3 uppercase" defaultValue={typeof value === "string" ? value : ""} name={name} required={required} /></label>; }
function money(value: number, currency: string) { return `${new Intl.NumberFormat("ru-MD", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value)} ${currency}`; }
