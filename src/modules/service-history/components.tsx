import Link from "next/link";

import { ProductLineThumbnail } from "@/src/modules/catalog/components/ProductLineThumbnail";
import {
  formatPartnerDate,
  partnerStatusLabel,
  warrantyStateLabel,
  type PartnerLocale,
} from "@/src/modules/partner-locale";
import {
  ONE_C_SERVICE_STATUS_LABELS,
  type AdminOneCServiceHistoryPage,
  type OneCServiceHistoryDetail,
  type UnifiedServiceHistoryPage,
} from "./types";

const portalStatusLabels: Record<string, string> = {
  created: "Заявка создана",
  accepted: "Принята",
  awaiting_equipment: "Ожидается оборудование",
  equipment_received: "Оборудование получено",
  diagnostics: "Диагностика",
  awaiting_information: "Ожидается информация",
  repair: "В ремонте",
  replacement_approved: "Одобрена замена",
  awaiting_replacement: "Ожидается замена",
  ready_for_pickup: "Готово к выдаче",
  closed: "Закрыто",
  rejected: "Отклонено",
  cancelled: "Отменено",
};

export function UnifiedServiceHistoryList({
  page,
  query = "",
  filter = "all",
  locale = "ru",
}: {
  page: UnifiedServiceHistoryPage;
  query?: string;
  filter?: string;
  locale?: PartnerLocale;
}) {
  const copy = historyCopy(locale);
  if (!page.items.length) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center">
        <h3 className="font-semibold">{copy.empty}</h3>
        <p className="mt-2 text-sm text-zinc-600">{copy.emptyHint}</p>
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(page.total / 20));
  return (
    <>
      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <ul className="divide-y divide-zinc-200">
          {page.items.map((item) => (
            <li key={`${item.sourceType}:${item.id}`}>
              <div className="grid min-h-28 grid-cols-[64px_minmax(0,1fr)] items-start gap-3 p-4 hover:bg-zinc-50 sm:grid-cols-[64px_minmax(0,1fr)_180px_auto] sm:items-center">
                <ProductLineThumbnail
                  href={item.productHref ?? undefined}
                  imageUrl={item.productImageUrl}
                  productName={item.productName ?? copy.equipment}
                  size="service"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase text-emerald-700">
                    {item.number}
                  </p>
                  {item.productHref ? (
                    <Link
                      className="mt-1 block line-clamp-2 font-medium hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                      href={item.productHref}
                      prefetch={false}
                      title={item.productName ?? undefined}
                    >
                      {item.productName ?? copy.equipmentPending}
                    </Link>
                  ) : (
                    <p
                      className="mt-1 line-clamp-2 font-medium"
                      title={item.productName ?? undefined}
                    >
                      {item.productName ?? copy.equipmentPending}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-zinc-500">
                    {[item.productSku, item.maskedSerial]
                      .filter(Boolean)
                      .join(" · ") || copy.noMarking}
                  </p>
                  {item.reportedFault ? (
                    <p className="mt-2 line-clamp-2 text-sm text-zinc-600">
                      {item.reportedFault}
                    </p>
                  ) : null}
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-sm font-medium text-zinc-900">
                    {statusLabel(item.status, locale)}
                  </p>
                  {item.status === "ready_for_pickup" ? (
                    <p className="mt-1 text-sm font-semibold text-emerald-700">
                      {copy.ready}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatPartnerDate(item.date, locale)}
                  </p>
                </div>
                <Link
                  className="col-span-2 inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:col-span-1"
                  href={item.href}
                  prefetch={false}
                >
                  {copy.open}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {pages > 1 ? (
        <nav
          aria-label={copy.pages}
          className="flex items-center justify-between gap-3"
        >
          <PaginationLink
            disabled={page.page <= 1}
            filter={filter}
            page={page.page - 1}
            query={query}
          >
            {copy.back}
          </PaginationLink>
          <span className="text-sm text-zinc-600">
            {copy.page} {page.page} {copy.of} {pages}
          </span>
          <PaginationLink
            disabled={page.page >= pages}
            filter={filter}
            page={page.page + 1}
            query={query}
          >
            {copy.next}
          </PaginationLink>
        </nav>
      ) : null}
    </>
  );
}

export function OneCServiceHistorySummary({
  detail,
  internal = false,
  locale = "ru",
}: {
  detail: OneCServiceHistoryDetail;
  internal?: boolean;
  locale?: PartnerLocale;
}) {
  const copy = historyCopy(locale);
  return (
    <div className="space-y-7">
      <section className="grid gap-4 border-b border-zinc-200 pb-6 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label={copy.status}
          value={
            internal
              ? ONE_C_SERVICE_STATUS_LABELS[detail.status]
              : statusLabel(detail.status, locale)
          }
        />
        <Metric
          label={copy.receivedOn}
          value={formatPartnerDate(detail.date, locale)}
        />
        <Metric
          label={copy.serial}
          value={detail.serial ?? detail.maskedSerial ?? copy.notProvided}
        />
        <Metric
          label={copy.warranty}
          value={warrantyLabel(detail.warrantyState, locale)}
        />
      </section>
      <section className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-5 sm:grid-cols-[120px_minmax(0,1fr)]">
        <ProductLineThumbnail
          href={detail.product.href ?? undefined}
          imageUrl={detail.product.imageUrl}
          productName={detail.product.name ?? copy.equipment}
          size="detail"
        />
        <div>
          <h2 className="text-lg font-semibold">
            {detail.product.name ?? copy.equipmentPending}
          </h2>
          {detail.product.sku ? (
            <p className="mt-1 text-sm text-zinc-500">
              SKU: {detail.product.sku}
            </p>
          ) : null}
          {detail.product.href ? (
            <Link
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700"
              href={detail.product.href}
            >
              {copy.openProduct}
            </Link>
          ) : null}
        </div>
      </section>
      <TextSection
        title={copy.reportedFault}
        value={detail.reportedFault ?? copy.noDescription}
      />
      {detail.completedWorkSummary ? (
        <TextSection
          title={internal ? "Содержание выполненных работ" : copy.completedWork}
          value={detail.completedWorkSummary}
        />
      ) : null}
      {detail.resolution ? (
        <TextSection title={copy.serviceResult} value={detail.resolution} />
      ) : null}
      <section className="grid gap-4 sm:grid-cols-2">
        <Metric
          label={copy.warrantyUntil}
          value={formatOptionalDate(
            detail.warrantyEndDate,
            locale,
            copy.notProvided,
          )}
        />
        <Metric
          label={copy.serviceCenter}
          value={detail.serviceCenter ?? copy.notProvided}
        />
      </section>
      {detail.events.length ? (
        <section>
          <h2 className="text-lg font-semibold">{copy.statusHistory}</h2>
          <ol className="mt-3 space-y-3">
            {detail.events.map((event) => (
              <li
                className="flex flex-col gap-1 border-l-2 border-emerald-200 pl-3 sm:flex-row sm:justify-between"
                key={event.id}
              >
                <span className="text-sm text-zinc-700">
                  {statusLabel(event.status, locale)}
                </span>
                <time className="text-xs text-zinc-500">
                  {formatPartnerDate(event.occurredAt, locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

export function AdminOneCServiceHistoryList({
  page,
}: {
  page: AdminOneCServiceHistoryPage;
}) {
  if (!page.items.length)
    return (
      <p className="rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
        Импортированных документов пока нет.
      </p>
    );
  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
      <ul className="divide-y divide-zinc-200">
        {page.items.map((item) => (
          <li key={item.id}>
            <Link
              className="grid min-h-20 gap-2 p-4 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:grid-cols-[150px_minmax(0,1fr)_190px_auto] sm:items-center"
              href={item.href}
            >
              <div>
                <p className="font-semibold">{item.number}</p>
                <p className="text-xs text-zinc-500">
                  {new Date(item.date).toLocaleDateString("ru-RU")}
                </p>
              </div>
              <div>
                <p className="font-medium">
                  {item.product_name ?? "Товар не сопоставлен"}
                </p>
                <p className="text-xs text-zinc-500">
                  {item.company_name ?? "Компания не сопоставлена"}
                  {item.sku ? ` · ${item.sku}` : ""}
                </p>
              </div>
              <span className="text-sm">
                {ONE_C_SERVICE_STATUS_LABELS[item.status]}
              </span>
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Только чтение
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function statusLabel(status: string, locale: PartnerLocale) {
  return locale === "ru"
    ? (ONE_C_SERVICE_STATUS_LABELS[
        status as keyof typeof ONE_C_SERVICE_STATUS_LABELS
      ] ??
        portalStatusLabels[status] ??
        "Статус уточняется")
    : partnerStatusLabel(locale, "service", status);
}
function warrantyLabel(value: string | null, locale: PartnerLocale) {
  return locale === "ro"
    ? warrantyStateLabel(locale, value ?? "verification_required")
    : ((
        {
          eligible: "Гарантия подтверждена",
          covered: "Гарантия подтверждена",
          active: "Гарантия действует",
          expired: "Гарантия истекла",
          returned: "Оборудование возвращено",
          cancelled: "Гарантия не действует",
          warranty_period_missing: "Срок гарантии уточняется",
          sale_confirmed_review_required: "Требует проверки",
          source_incomplete: "Требует проверки",
          manual_review_required: "Требует проверки",
          conflict: "Требует проверки",
        } as Record<string, string>
      )[value ?? ""] ?? "Требует проверки");
}
function formatOptionalDate(
  value: string | null,
  locale: PartnerLocale,
  fallback: string,
) {
  return value ? formatPartnerDate(value, locale) : fallback;
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <dl>
      <dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-zinc-900">{value}</dd>
    </dl>
  );
}
function TextSection({ title, value }: { title: string; value: string }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{value}</p>
    </section>
  );
}
function PaginationLink({
  children,
  disabled,
  filter,
  page,
  query,
}: {
  children: React.ReactNode;
  disabled: boolean;
  filter: string;
  page: number;
  query: string;
}) {
  if (disabled)
    return (
      <span
        aria-disabled="true"
        className="inline-flex min-h-11 items-center px-3 text-sm text-zinc-400"
      >
        {children}
      </span>
    );
  const params = new URLSearchParams({ filter, page: String(page) });
  if (query) params.set("query", query);
  return (
    <Link
      className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 px-3 text-sm font-semibold"
      href={`/cabinet/service?${params}`}
    >
      {children}
    </Link>
  );
}

function historyCopy(locale: PartnerLocale) {
  return locale === "ro"
    ? {
        empty: "Istoricul este gol",
        emptyHint:
          "Documentele de service și solicitările vor apărea aici după înregistrare.",
        equipment: "Echipament",
        equipmentPending: "Echipament în curs de clarificare",
        noMarking: "Fără marcaj suplimentar",
        ready: "Echipamentul este gata de ridicare.",
        open: "Deschide",
        pages: "Paginile istoricului",
        back: "Înapoi",
        page: "Pagina",
        of: "din",
        next: "Înainte",
        status: "Statut",
        receivedOn: "Data recepției",
        serial: "Număr de serie",
        warranty: "Garanție",
        notProvided: "Nu este indicat",
        openProduct: "Deschide produsul",
        reportedFault: "Defecțiunea declarată",
        noDescription: "Descrierea nu este indicată.",
        completedWork: "Lucrări efectuate",
        serviceResult: "Rezultatul service-ului",
        warrantyUntil: "Garanție până la",
        serviceCenter: "Centru de service",
        statusHistory: "Istoricul statutelor",
      }
    : {
        empty: "История пока пуста",
        emptyHint:
          "Сервисные документы и заявки появятся здесь после регистрации.",
        equipment: "Оборудование",
        equipmentPending: "Оборудование уточняется",
        noMarking: "Без дополнительной маркировки",
        ready: "Оборудование готово к выдаче.",
        open: "Открыть",
        pages: "Страницы истории",
        back: "Назад",
        page: "Страница",
        of: "из",
        next: "Далее",
        status: "Статус",
        receivedOn: "Дата приёма",
        serial: "Серийный номер",
        warranty: "Гарантия",
        notProvided: "Не указан",
        openProduct: "Открыть товар",
        reportedFault: "Заявленная неисправность",
        noDescription: "Описание не указано.",
        completedWork: "Выполненные работы",
        serviceResult: "Результат обслуживания",
        warrantyUntil: "Гарантия до",
        serviceCenter: "Сервисный центр",
        statusHistory: "История статусов",
      };
}
