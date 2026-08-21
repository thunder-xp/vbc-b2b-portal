import Link from "next/link";
import { ProductLineThumbnail } from "@/src/modules/catalog/components/ProductLineThumbnail";
import {
  formatPartnerDate,
  serviceCopy,
  serviceStatusLabel,
  serviceTypeLabel,
  warrantyStateLabel,
  type PartnerLocale,
} from "@/src/modules/partner-locale";
import {
  SERVICE_STATUS_LABELS,
  SERVICE_TYPE_LABELS,
  type ServiceCaseDetail,
  type ServiceCasePage,
} from "./types";

export function ServiceCaseList({
  page,
  admin = false,
  locale = "ru",
}: {
  page: ServiceCasePage;
  admin?: boolean;
  locale?: PartnerLocale;
}) {
  const copy = serviceCopy(locale);
  if (!page.items.length)
    return (
      <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center">
        <h2 className="font-semibold">{copy.noCases}</h2>
        <p className="mt-2 text-sm text-zinc-600">{copy.noCasesHint}</p>
      </div>
    );
  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
      <ul className="divide-y divide-zinc-200">
        {page.items.map((item) => (
          <li key={item.id}>
            <Link
              className="grid min-h-20 gap-2 p-4 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:grid-cols-[150px_minmax(0,1fr)_180px_120px] sm:items-center"
              href={`${admin ? "/admin" : "/cabinet"}/service/${item.id}`}
              prefetch={false}
            >
              <div>
                <p className="font-semibold">{item.caseNumber}</p>
                <p className="text-xs text-zinc-500">
                  {admin
                    ? SERVICE_TYPE_LABELS[item.caseType]
                    : serviceTypeLabel(locale, item.caseType)}
                </p>
              </div>
              <div>
                <p className="font-medium">
                  {item.productName ?? copy.productPending}
                </p>
                <p className="text-xs text-zinc-500">
                  {item.companyName ?? item.productSku ?? copy.unlinked}
                </p>
              </div>
              <span className="text-sm">
                {admin
                  ? SERVICE_STATUS_LABELS[item.status]
                  : serviceStatusLabel(locale, item.status)}
              </span>
              <span
                className={
                  item.overdue
                    ? "text-sm font-medium text-rose-700"
                    : "text-sm text-zinc-500"
                }
              >
                {item.overdue
                  ? copy.attention
                  : formatPartnerDate(item.updatedAt, locale)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
export function ServiceCaseSummary({
  detail,
  internal = false,
  locale = "ru",
}: {
  detail: ServiceCaseDetail;
  internal?: boolean;
  locale?: PartnerLocale;
}) {
  const copy = serviceCopy(locale);
  return (
    <div className="space-y-6">
      {detail.product ? (
        <ProductSummary internal={internal} product={detail.product} />
      ) : null}
      <section className="grid gap-4 border-b border-zinc-200 pb-6 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label={copy.status}
          value={
            internal
              ? SERVICE_STATUS_LABELS[detail.status]
              : serviceStatusLabel(locale, detail.status)
          }
        />
        <Metric
          label={copy.product}
          value={
            detail.product
              ? `${detail.product.sku} · ${detail.product.name}`
              : copy.productPending
          }
        />
        <Metric
          label={copy.serial}
          value={detail.serialNumber ?? copy.requiresReview}
        />
        <Metric
          label={copy.warranty}
          value={warrantyStateLabel(locale, detail.warrantyState)}
        />
      </section>
      <section>
        <h2 className="text-lg font-semibold">{copy.descriptionLabel}</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
          {detail.description}
        </p>
        {detail.symptoms ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600">
            {copy.symptoms}: {detail.symptoms}
          </p>
        ) : null}
      </section>
      <section>
        <h2 className="text-lg font-semibold">{copy.history}</h2>
        <ol className="mt-3 space-y-3">
          {detail.events.map((event) => (
            <li
              className="flex flex-col gap-1 border-l-2 border-emerald-200 pl-3 sm:flex-row sm:justify-between"
              key={event.id}
            >
              <span className="text-sm text-zinc-700">
                {event.message ?? serviceStatusLabel(locale, detail.status)}
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
      {detail.attachments.length ? (
        <section>
          <h2 className="text-lg font-semibold">{copy.materials}</h2>
          <ul className="mt-3 space-y-2">
            {detail.attachments.map((file) => (
              <li key={file.id}>
                <Link
                  className="text-sm font-medium text-emerald-700 underline"
                  href={`/api/service/attachments/${file.id}`}
                >
                  {file.fileName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {detail.documents.length ? (
        <section>
          <h2 className="text-lg font-semibold">{copy.serviceDocuments}</h2>
          <ul className="mt-3 space-y-2">
            {detail.documents.map((doc) => (
              <li key={doc.id}>
                <Link
                  className="text-sm font-medium text-emerald-700 underline"
                  href={
                    internal
                      ? `/api/service/documents/${doc.id}`
                      : `/cabinet/documents/${doc.id}`
                  }
                >
                  {doc.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {internal && detail.replacementState === "possible_candidate" ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm">
          Возможный кандидат программы прямой замены. Решение допускается только
          после подтверждённой диагностики.
        </p>
      ) : null}
    </div>
  );
}
function ProductSummary({
  internal,
  product,
}: {
  internal: boolean;
  product: NonNullable<ServiceCaseDetail["product"]>;
}) {
  const href = internal ? null : product.href;
  return (
    <section className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-5 border-b border-zinc-200 pb-6 sm:grid-cols-[120px_minmax(0,1fr)]">
      <ProductLineThumbnail
        href={href ?? undefined}
        imageUrl={product.imageUrl}
        productName={product.name}
        size="detail"
      />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase text-zinc-500">
          SKU {product.sku}
        </p>
        {href ? (
          <Link
            className="mt-1 block font-semibold text-zinc-950 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            href={href}
          >
            {product.name}
          </Link>
        ) : (
          <p className="mt-1 font-semibold text-zinc-950">{product.name}</p>
        )}
      </div>
    </section>
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
