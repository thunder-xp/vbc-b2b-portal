import Link from "next/link";
import {
  formatPartnerDate,
  supportCopy,
  supportPriorityLabel,
  supportStatusLabel,
  type PartnerLocale,
} from "@/src/modules/partner-locale";

import {
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_STATUS_LABELS,
  type SupportTicketDetail,
  type SupportTicketPage,
} from "./types";

export function SupportTicketList({
  page,
  admin = false,
  locale = "ru",
}: {
  page: SupportTicketPage;
  admin?: boolean;
  locale?: PartnerLocale;
}) {
  const copy = supportCopy(locale);
  if (!page.items.length) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center">
        <h2 className="font-semibold">{copy.noTickets}</h2>
        <p className="mt-2 text-sm text-zinc-600">{copy.noTicketsHint}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
      <ul className="divide-y divide-zinc-200">
        {page.items.map((item) => (
          <li key={item.id}>
            <Link
              className="grid min-h-20 gap-2 p-4 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:grid-cols-[160px_minmax(0,1fr)_170px_150px] sm:items-center"
              href={`${admin ? "/admin" : "/cabinet"}/support/${item.id}`}
              prefetch={false}
            >
              <div>
                <p className="font-semibold">{item.ticketNumber}</p>
                <p className="text-xs text-zinc-500">
                  {formatPartnerDate(item.createdAt, locale)}
                </p>
              </div>
              <div>
                <p className="line-clamp-2 text-sm text-zinc-800">
                  {item.description}
                </p>
                {item.companyName ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    {item.companyName} · {item.applicantName}
                  </p>
                ) : null}
              </div>
              <div className="text-sm">
                <p>
                  {admin
                    ? SUPPORT_STATUS_LABELS[item.status]
                    : supportStatusLabel(locale, item.status)}
                </p>
                <p className="text-xs text-zinc-500">
                  {admin
                    ? SUPPORT_PRIORITY_LABELS[item.effectivePriority]
                    : supportPriorityLabel(locale, item.effectivePriority)}
                </p>
                {admin ? (
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {item.assignedInternalUserName ?? "Не назначена"}
                  </p>
                ) : null}
              </div>
              <span
                className={
                  item.overdue
                    ? "text-sm font-medium text-rose-700"
                    : "text-sm text-zinc-500"
                }
              >
                {item.overdue
                  ? locale === "ro"
                    ? "Termen depășit"
                    : "Просрочено"
                  : (item.nextAction ??
                    formatPartnerDate(item.updatedAt, locale))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SupportTicketSummary({
  detail,
  internal = false,
  locale = "ru",
}: {
  detail: SupportTicketDetail;
  internal?: boolean;
  locale?: PartnerLocale;
}) {
  const text =
    locale === "ro"
      ? {
          status: "Statut",
          priority: "Prioritate",
          updated: "Actualizată",
          applicant: "Solicitant",
          name: "Nume",
          company: "Companie",
          phone: "Telefon",
          notProvided: "Nu este indicat",
          description: "Descriere",
          solution: "Soluție propusă",
          messages: "Conversație",
          history: "Istoric",
          materials: "Materiale",
        }
      : {
          status: "Статус",
          priority: "Приоритет",
          updated: "Обновлена",
          applicant: "Заявитель",
          name: "Имя",
          company: "Компания",
          phone: "Телефон",
          notProvided: "Не указан",
          description: "Описание",
          solution: "Предложенное решение",
          messages: "Переписка",
          history: "История",
          materials: "Материалы",
        };
  return (
    <div className="space-y-6">
      <section className="grid gap-4 border-b border-zinc-200 pb-6 sm:grid-cols-3">
        <Metric
          label={text.status}
          value={
            internal
              ? SUPPORT_STATUS_LABELS[detail.status]
              : supportStatusLabel(locale, detail.status)
          }
        />
        <Metric
          label={text.priority}
          value={
            internal
              ? SUPPORT_PRIORITY_LABELS[detail.effectivePriority]
              : supportPriorityLabel(locale, detail.effectivePriority)
          }
        />
        <Metric
          label={text.updated}
          value={formatPartnerDate(detail.updatedAt, locale, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        />
      </section>
      <section>
        <h2 className="text-lg font-semibold">{text.applicant}</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <Metric label={text.name} value={detail.applicant.name} />
          <Metric label={text.company} value={detail.applicant.company} />
          <Metric label="Email" value={detail.applicant.email} />
          <Metric
            label={text.phone}
            value={detail.applicant.phone ?? text.notProvided}
          />
          {internal ? (
            <>
              <Metric label="Роль" value={detail.applicant.role} />
              <Metric
                label="IDNO"
                value={detail.applicant.fiscalCode ?? "Не указан"}
              />
              <Metric
                label="Статус партнёра"
                value={detail.applicant.partnerStatus}
              />
              <Metric
                label="Источник"
                value={detail.sourceRoute ?? "Не указан"}
              />
            </>
          ) : null}
        </dl>
      </section>
      <section>
        <h2 className="text-lg font-semibold">{text.description}</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
          {detail.description}
        </p>
      </section>
      {detail.resolutionSummary ? (
        <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="font-semibold">{text.solution}</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">
            {detail.resolutionSummary}
          </p>
        </section>
      ) : null}
      <section>
        <h2 className="text-lg font-semibold">{text.messages}</h2>
        <ol className="mt-3 space-y-3">
          {detail.messages.map((message) => (
            <li
              className={`rounded-md border p-3 text-sm ${message.visibility === "internal" ? "border-amber-200 bg-amber-50" : "border-zinc-200"}`}
              key={message.id}
            >
              <p className="whitespace-pre-wrap">{message.body}</p>
              <time className="mt-2 block text-xs text-zinc-500">
                {formatPartnerDate(message.createdAt, locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </time>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h2 className="text-lg font-semibold">{text.history}</h2>
        <ol className="mt-3 space-y-3">
          {detail.events.map((event) => (
            <li className="border-l-2 border-emerald-200 pl-3" key={event.id}>
              <p className="text-sm text-zinc-700">
                {event.message ?? event.type}
              </p>
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
      {detail.attachments.length ? (
        <section>
          <h2 className="text-lg font-semibold">{text.materials}</h2>
          <ul className="mt-3 space-y-2">
            {detail.attachments.map((file) => (
              <li key={file.id}>
                <Link
                  className="text-sm font-medium text-emerald-700 underline"
                  href={`/api/support/attachments/${file.id}`}
                >
                  {file.fileName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-zinc-900">{value}</dd>
    </div>
  );
}
