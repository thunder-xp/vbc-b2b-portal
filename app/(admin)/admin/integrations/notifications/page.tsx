import {
  getNotificationHealthAction,
  retryNotificationDeliveryAction,
} from "@/src/modules/notifications/actions";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import {
  getPriceSyncStateAction,
  getStockSyncStateAction,
} from "@/src/modules/integration/actions";
import {
  FINANCE_REMINDER_EMAIL_LIVE,
  FINANCE_REMINDER_IN_APP_LIVE,
  FINANCE_REMINDER_OUTBOUND_MODE,
  FINANCE_REMINDER_SMS_ENABLED,
} from "@/src/modules/finance/services";
import { communicationRuntimePolicyFromEnvironment } from "@/src/modules/notifications/gateway";

export const dynamic = "force-dynamic";

export default async function NotificationHealthPage() {
  await requireAdminPagePermission("admin.integrations.view");
  const [health, priceResult, stockResult] = await Promise.all([
    getNotificationHealthAction(),
    getPriceSyncStateAction(),
    getStockSyncStateAction(),
  ]);
  const run = health.lastShipmentWorkerRun;
  const communicationPolicy = communicationRuntimePolicyFromEnvironment();
  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-medium text-emerald-700">Интеграции</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950">Уведомления</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Безопасная агрегированная диагностика генерации за последние 24 часа.
        </p>
      </header>
      <dl className="grid gap-px border border-zinc-200 bg-zinc-200 sm:grid-cols-3">
        <Metric label="Создано" value={health.generated} />
        <Metric label="Непрочитано" value={health.unread} />
        <Metric label="Дедуплицировано" value={health.deduplicated} />
      </dl>
      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold text-zinc-950">Коммерческие публикации</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <Detail
            label="Цены"
            value={priceResult.success
              ? `${priceResult.data.status} · ${priceResult.data.lastSuccessfulSyncAt ?? "Нет успешной публикации"}`
              : "Состояние недоступно"}
          />
          <Detail
            label="Остатки и поступления"
            value={stockResult.success
              ? `${stockResult.data.status} · ${stockResult.data.lastSuccessfulSyncAt ?? "Нет успешной публикации"}`
              : "Состояние недоступно"}
          />
        </dl>
      </section>
      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold text-zinc-950">Планировщик отгрузок</h2>
        {run ? (
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
            <Detail label="Статус" value={run.status} />
            <Detail label="Бизнес-дата" value={run.businessDate} />
            <Detail label="Создано" value={String(run.notificationsCreated)} />
            <Detail label="Обработано событий" value={String(run.sourceEventsProcessed)} />
            <Detail label="Длительность" value={run.durationMs === null ? "Нет данных" : `${run.durationMs} мс`} />
            <Detail label="Завершён" value={run.finishedAt ?? "Нет данных"} />
          </dl>
        ) : (
          <p className="mt-3 text-sm text-zinc-600">Запусков пока нет.</p>
        )}
      </section>
      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold text-zinc-950">Товары под наблюдением</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <Detail label="Переходов зафиксировано" value={String(health.productTransitionsCaptured)} />
          <Detail label="Получателей определено" value={String(health.productWatcherRecipientsResolved)} />
          <Detail label="Создано уведомлений" value={String(health.productNotificationsCreated)} />
          <Detail label="Дедуплицировано" value={String(health.productDeduplicated)} />
          <Detail label="Подавлено настройками" value={String(health.productSuppressed)} />
          <Detail label="Ошибок проекции" value={String(health.productFailedProjections)} />
          <Detail
            label="Старейший необработанный переход"
            value={health.oldestUnprocessedProductTransition ?? "Нет"}
          />
          <Detail
            label="Последние синхронизации"
            value={health.lastProcessedProductSyncIds.join(", ") || "Нет"}
          />
          <Detail
            label="Последний запуск"
            value={health.lastProductProjectionRun?.status ?? "Нет"}
          />
        </dl>
      </section>
      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold text-zinc-950">Безопасность каналов</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <Detail label="Глобальный внешний стоп" value={communicationPolicy.globalExternalKillSwitch ? "ON" : "OFF"} />
          <Detail label="Email стоп" value={communicationPolicy.channelKillSwitches.email ? "ON" : "OFF"} />
          <Detail label="SMS стоп" value={communicationPolicy.channelKillSwitches.sms ? "ON" : "OFF"} />
          <Detail label="Финансы · email" value={`${FINANCE_REMINDER_OUTBOUND_MODE} · LIVE ${FINANCE_REMINDER_EMAIL_LIVE ? "ON" : "OFF"}`} />
          <Detail label="Финансы · в приложении" value={`${FINANCE_REMINDER_OUTBOUND_MODE} · LIVE ${FINANCE_REMINDER_IN_APP_LIVE ? "ON" : "OFF"}`} />
          <Detail label="Финансы · SMS" value={FINANCE_REMINDER_SMS_ENABLED ? "ENABLED" : "DISABLED"} />
        </dl>
      </section>
      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold text-zinc-950">Шлюз транзакционных уведомлений</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-5">
          <Detail label="В очереди" value={String(health.gateway.queued)} />
          <Detail label="Обрабатывается" value={String(health.gateway.processing)} />
          <Detail label="Принято провайдером за 24 часа" value={String(health.gateway.sentLast24Hours)} />
          <Detail label="Ожидает повтора" value={String(health.gateway.failed)} />
          <Detail label="Требует внимания" value={String(health.gateway.deadLetter)} />
        </dl>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-4 lg:grid-cols-9">
          {Object.entries(health.gateway.stateCounts).map(([state, count]) => (
            <Detail key={state} label={state} value={String(count)} />
          ))}
        </dl>
        {health.gateway.recentDeliveries.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="text-zinc-500">
                <tr>
                  <th className="pb-2 font-medium">Событие</th>
                  <th className="pb-2 font-medium">Компания / заказ</th>
                  <th className="pb-2 font-medium">Канал / получатель</th>
                  <th className="pb-2 font-medium">Статус</th>
                  <th className="pb-2 font-medium">Попытки</th>
                  <th className="pb-2 font-medium">Создано / попытка</th>
                  <th className="pb-2 font-medium">Принято провайдером</th>
                  <th className="pb-2 font-medium">Безопасная ошибка</th>
                  <th className="pb-2 font-medium">Correlation ID</th>
                  <th className="pb-2"><span className="sr-only">Действия</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {health.gateway.recentDeliveries.map((delivery) => (
                  <tr key={delivery.deliveryId ?? delivery.eventId}>
                    <td className="py-3 font-mono text-xs text-zinc-900">
                      <span className="block">{delivery.eventType}</span>
                      <span className="mt-1 block text-zinc-500">
                        {delivery.templateKey} · {delivery.templateVersion}
                      </span>
                    </td>
                    <td className="py-3 text-zinc-700">
                      <span className="block font-medium text-zinc-900">{delivery.companyName}</span>
                      <span>{delivery.orderNumber ?? delivery.partnerOrderId ?? "—"}</span>
                    </td>
                    <td className="py-3 text-zinc-700">
                      <span className="block">{delivery.channel} · {delivery.mode}</span>
                      <span>{delivery.recipient}</span>
                    </td>
                    <td className="py-3 text-zinc-700">{delivery.state}</td>
                    <td className="py-3 text-zinc-700">{delivery.attempts}</td>
                    <td className="py-3 text-zinc-700">
                      <span className="block">{delivery.createdAt}</span>
                      <span className="mt-1 block text-zinc-500">{delivery.attemptedAt ?? "—"}</span>
                    </td>
                    <td className="py-3 text-zinc-700">{delivery.sentAt ?? "—"}</td>
                    <td className="py-3 text-zinc-700">{delivery.safeError ?? "—"}</td>
                    <td className="py-3 font-mono text-xs text-zinc-700">{delivery.correlationId}</td>
                    <td className="py-3 text-right">
                      {delivery.deliveryId
                        && delivery.safeError !== "recipient_unavailable"
                        && delivery.mode === "LIVE"
                        && (delivery.state === "FAILED_RETRYABLE" || delivery.state === "FAILED_FINAL") ? (
                        <form action={retryNotificationDeliveryAction}>
                          <input type="hidden" name="deliveryId" value={delivery.deliveryId} />
                          <button
                            className="min-h-11 border border-zinc-300 px-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
                            type="submit"
                          >
                            Повторить
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-600">Доставок пока нет.</p>
        )}
      </section>
      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold text-zinc-950">Авторизация планировщика</h2>
        {health.cronRoutes.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-zinc-500">
                <tr>
                  <th className="pb-2 font-medium">Маршрут</th>
                  <th className="pb-2 font-medium">Результат</th>
                  <th className="pb-2 font-medium">Источник</th>
                  <th className="pb-2 font-medium">Последний вызов</th>
                  <th className="pb-2 font-medium">Успешно / отказано</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {health.cronRoutes.map((route) => (
                  <tr key={route.route}>
                    <td className="py-2 font-mono text-xs text-zinc-900">
                      {route.route}
                    </td>
                    <td className="py-2 text-zinc-700">
                      {route.lastAuthCategory}
                    </td>
                    <td className="py-2 text-zinc-700">{route.lastCallerType}</td>
                    <td className="py-2 text-zinc-700">{route.lastInvokedAt}</td>
                    <td className="py-2 text-zinc-700">
                      {route.authorizedCount} / {route.deniedCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-600">
            Данные появятся после следующего вызова планировщика.
          </p>
        )}
      </section>
      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold text-zinc-950">Последние сбои</h2>
        {health.recentFailures.length ? (
          <ul className="mt-3 divide-y divide-zinc-100">
            {health.recentFailures.map((failure) => (
              <li className="py-3 text-sm" key={failure.runId}>
                <span className="font-medium text-zinc-900">{failure.worker}</span>
                <span className="ml-2 text-zinc-500">{failure.safeErrorCode ?? "unknown"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-zinc-600">Недавних сбоев нет.</p>
        )}
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="bg-white p-4"><dt className="text-sm text-zinc-600">{label}</dt><dd className="mt-1 text-2xl font-semibold text-zinc-950">{value}</dd></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-zinc-500">{label}</dt><dd className="mt-1 font-medium text-zinc-950">{value}</dd></div>;
}
