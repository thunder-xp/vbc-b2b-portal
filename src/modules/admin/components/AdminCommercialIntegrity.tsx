import type {
  AdminCommercialIntegrity as Integrity,
  CommercialIntegrityReason,
} from "../types";

const REASON_LABELS: Record<CommercialIntegrityReason, string> = {
  company_price_profile_missing: "Не назначен статус партнёра",
  missing_partner_price: "Нет текущей партнёрской цены",
  missing_retail: "Нет текущей цены RETAIL",
  missing_stock: "Нет опубликованного остатка",
  stale_partner_price: "Цена давно не обновлялась",
  stale_stock: "Остаток давно не обновлялся",
  unpublished_product: "Товар не опубликован",
};

const ORDER_REASON_LABELS: Record<Integrity["orders"][number]["reason"], string> = {
  source_document_deleted: "Документ удалён в 1С",
  source_zero_lines: "В источнике нет строк",
  zero_local_lines: "Строки ещё не загружены",
  partially_resolved: "Состав загружен частично",
  unmapped_products: "Есть товары без сопоставления",
};

export function AdminCommercialIntegrityView({ integrity }: { integrity: Integrity }) {
  const metrics = [
    ["Активные строки корзин", integrity.cartSummary.activeLines],
    ["Полностью разрешены", integrity.cartSummary.fullyResolved],
    ["Без партнёрской цены", integrity.cartSummary.missingPartnerPrice],
    ["Без остатка", integrity.cartSummary.missingStock],
    ["Требуют проверки заказов", integrity.orderSummary.reviewRequired],
    ["Удалены в источнике", integrity.orderSummary.sourceDeleted],
  ] as const;

  return (
    <section className="space-y-4 border-t border-zinc-200 pt-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-950">Целостность коммерческих данных</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Локальная диагностика цен, остатков и состава заказов. Данные из 1С при открытии страницы не запрашиваются.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(([label, value]) => (
          <article className="border border-zinc-200 bg-white p-4" key={label}>
            <p className="text-xs uppercase text-zinc-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950">{value}</p>
          </article>
        ))}
      </div>

      <SyncStates integrity={integrity} />

      {integrity.cartLines.length ? (
        <DiagnosticTable
          headers={["Компания", "SKU", "Товар", "Причины"]}
          rows={integrity.cartLines.map((line) => [
            line.companyName,
            line.sku,
            line.productName,
            line.reasons.map((reason) => REASON_LABELS[reason]).join("; "),
          ])}
          title="Неразрешённые строки активных корзин"
        />
      ) : null}

      {integrity.orders.length ? (
        <DiagnosticTable
          headers={["Компания", "Заказ", "Источник / локально", "Состояние"]}
          rows={integrity.orders.map((order) => [
            order.companyName,
            order.orderNumber,
            `${order.sourceLineCount} / ${order.localLineCount}`,
            ORDER_REASON_LABELS[order.reason],
          ])}
          title="Заказы с расхождением состава"
        />
      ) : null}
    </section>
  );
}

function SyncStates({ integrity }: { integrity: Integrity }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {[["Цены", integrity.priceSync], ["Остатки", integrity.stockSync]].map(([label, state]) => (
        <article className="border border-zinc-200 bg-white p-4" key={label as string}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-zinc-950">{label as string}</h3>
            <span className="text-sm text-zinc-600">{typeof state === "object" && state ? state.status : "нет данных"}</span>
          </div>
          {typeof state === "object" && state ? (
            <p className="mt-2 text-xs text-zinc-600">
              Этап: {state.stage ?? "не указан"}. Последняя успешная публикация: {state.lastSuccessfulAt ? new Date(state.lastSuccessfulAt).toLocaleString("ru-RU") : "не выполнялась"}.
              {state.failedStage ? ` Ошибка на этапе ${state.failedStage}${state.databaseErrorCode ? ` (${state.databaseErrorCode})` : ""}.` : ""}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function DiagnosticTable({ title, headers, rows }: { title: string; headers: readonly string[]; rows: readonly (readonly string[])[] }) {
  return (
    <div className="overflow-hidden border border-zinc-200 bg-white">
      <h3 className="border-b border-zinc-200 px-4 py-3 font-semibold text-zinc-950">{title}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr>{headers.map((header) => <th className="px-4 py-3" key={header}>{header}</th>)}</tr></thead>
          <tbody className="divide-y divide-zinc-100">{rows.map((row, index) => <tr key={`${row[1]}-${index}`}>{row.map((value, cell) => <td className="px-4 py-3" key={`${headers[cell]}-${value}`}>{value}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
