import Link from "next/link";

import { createAdminOperationsService, requireAdminPagePermission } from "../services";
import type { AdminOperationalPage as OperationalPage } from "../types";
import { AdminPageHeader } from "./AdminPageHeader";

const CONFIG = {
  orders: {
    permission: "admin.orders.view",
    title: "Заказы",
    description: "Локальный read-модель заказов без запросов к 1С.",
  },
  shipments: {
    permission: "admin.shipments.view",
    title: "Планируемые отгрузки",
    description: "Заказы с подтверждённой датой отгрузки из локального read-моделя.",
  },
  reservations: {
    permission: "reservations.review",
    title: "Резервы",
    description: "Отдельный исторический процесс резервирования по спецификациям.",
  },
} as const;

export async function AdminOperationalPageView({
  page,
  view,
}: {
  page?: number;
  view: keyof typeof CONFIG;
}) {
  const config = CONFIG[view];
  await requireAdminPagePermission(config.permission);
  const data = await createAdminOperationsService().getOperationalPage(view, page);
  return (
    <div className="space-y-6">
      <AdminPageHeader eyebrow="Операции" title={config.title} description={config.description} />
      <OperationalTable data={data} view={view} />
    </div>
  );
}

function OperationalTable({
  data,
  view,
}: {
  data: OperationalPage;
  view: keyof typeof CONFIG;
}) {
  return (
    <div className="overflow-x-auto border border-zinc-200 bg-white">
      <table className="min-w-[900px] w-full text-left text-sm">
        <thead className="border-b bg-zinc-50">
          <tr>{["Компания", "Номер", "Статус", "Дата", "План", "Позиций", "Единиц", ...(view === "orders" ? ["Экспорт 1С"] : [])].map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {data.records.map((record) => (
            <tr key={record.id}>
              <td className="px-4 py-3">{record.company}</td>
              <td className="px-4 py-3 font-medium">
                {view === "reservations" ? (
                  <Link className="text-emerald-700" href={`/admin/reservations/${record.id}`}>{record.reference}</Link>
                ) : record.reference}
              </td>
              <td className="px-4 py-3">{record.status}</td>
              <td className="px-4 py-3">{format(record.date)}</td>
              <td className="px-4 py-3">{format(record.plannedDate)}</td>
              <td className="px-4 py-3">{record.positions}</td>
              <td className="px-4 py-3">{record.units}</td>
              {view === "orders" ? (
                <td className="min-w-64 px-4 py-3">
                  <ExportDiagnostic diagnostic={record.exportDiagnostic} />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {!data.records.length ? <p className="p-8 text-center text-zinc-500">Записей нет.</p> : null}
    </div>
  );
}

function ExportDiagnostic({
  diagnostic,
}: {
  diagnostic: OperationalPage["records"][number]["exportDiagnostic"];
}) {
  if (!diagnostic) return <span className="text-zinc-500">Нет данных</span>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
      <dt className="text-zinc-500">Оплата</dt>
      <dd>{diagnostic.paymentMethod === "cash" ? "Наличный" : "Безналичный"}</dd>
      <dt className="text-zinc-500">Договор</dt><dd>{diagnostic.contract ?? "—"}</dd>
      <dt className="text-zinc-500">Тип цен</dt><dd>{diagnostic.priceType ?? "—"}</dd>
      <dt className="text-zinc-500">Дата оплаты</dt><dd>{format(diagnostic.plannedPaymentDate)}</dd>
      <dt className="text-zinc-500">Получение</dt>
      <dd>{diagnostic.fulfillmentMethod === "delivery" ? `Доставка${diagnostic.carrier ? `: ${diagnostic.carrier}` : ""}` : "Самовывоз"}</dd>
      <dt className="text-zinc-500">Проверка</dt>
      <dd className={diagnostic.readBackVerified ? "text-emerald-700" : "text-amber-700"}>
        {diagnostic.readBackVerified ? "Совпадает" : "Ожидается"}
      </dd>
    </dl>
  );
}

function format(value: string | null): string {
  return value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short" }).format(new Date(value)) : "—";
}
