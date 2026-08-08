import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { getServiceDiagnosticsAction } from "@/src/modules/service-center";
import { getOneCServiceHistoryDiagnosticsAction } from "@/src/modules/service-history";

const portalLabels: Record<string, string> = { totalCases: "Все заявки", active: "Активные", unassigned: "Без исполнителя", waitingForPartner: "Ожидают партнёра", waitingForEquipment: "Ожидают оборудование", diagnosis: "Диагностика", repair: "Ремонт", replacement: "Замена", readyForPickup: "Готовы к выдаче", overdue: "Просрочены", closed: "Закрыты", notificationFailures: "Ошибки уведомлений", missingRequiredDocuments: "Нет итогового документа", attachmentFailures: "Отклонённые вложения" };
const historyLabels: Record<string, string> = { imported: "Импортировано", mappedCompanies: "Компании сопоставлены", unmappedCompanies: "Компании не сопоставлены", mappedProducts: "Товары сопоставлены", unmappedProducts: "Товары не сопоставлены", serialLinked: "Серийные номера связаны", serialUnlinked: "Серийные номера не связаны", activeRepairs: "Активный ремонт", readyForPickup: "Готово к выдаче", issued: "Выдано", unknownStatuses: "Неизвестные статусы", inactive: "Неактивные документы", conflicts: "Конфликты" };

export default async function ServiceIntegrationPage() {
  await requireAdminPagePermission("admin.service.view");
  const [portal, history] = await Promise.all([getServiceDiagnosticsAction(), getOneCServiceHistoryDiagnosticsAction()]);
  return <div className="space-y-8">
    <header><p className="text-xs font-semibold uppercase text-emerald-700">Интеграции</p><h1 className="mt-1 text-2xl font-semibold">Сервисный центр</h1><p className="mt-2 text-sm text-zinc-600">Операционная диагностика по локальным read models без live-запросов к 1С.</p></header>
    <DiagnosticSection data={portal.success ? portal.data : null} labels={portalLabels} title="Заявки портала" />
    <DiagnosticSection data={history.success ? history.data : null} labels={historyLabels} title="История ремонта из 1С" />
    {history.success ? <section className="rounded-md border border-zinc-200 bg-white p-5 text-sm"><h2 className="font-semibold">Последняя синхронизация</h2><p className="mt-2 text-zinc-600">Источник: {history.data.latestSourceDate ? new Date(history.data.latestSourceDate).toLocaleString("ru-RU") : "Нет данных"}</p><p className="mt-1 text-zinc-600">Запуск: {history.data.latestSync ? new Date(String(history.data.latestSync.started_at)).toLocaleString("ru-RU") : "Нет запусков"}</p></section> : null}
  </div>;
}

function DiagnosticSection({ data, labels, title }: { data: Record<string, unknown> | null; labels: Record<string, string>; title: string }) {
  return <section className="space-y-3"><h2 className="text-lg font-semibold">{title}</h2>{data ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(labels).map(([key, label]) => <article className="rounded-md border border-zinc-200 bg-white p-4" key={key}><p className="text-sm text-zinc-600">{label}</p><p className="mt-1 text-2xl font-semibold">{String(data[key] ?? 0)}</p></article>)}</div> : <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Диагностика временно недоступна.</p>}</section>;
}
