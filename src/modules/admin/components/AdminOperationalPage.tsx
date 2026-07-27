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
          <tr>{["Компания", "Номер", "Статус", "Дата", "План", "Позиций", "Единиц"].map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr>
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
            </tr>
          ))}
        </tbody>
      </table>
      {!data.records.length ? <p className="p-8 text-center text-zinc-500">Записей нет.</p> : null}
    </div>
  );
}

function format(value: string | null): string {
  return value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short" }).format(new Date(value)) : "—";
}
