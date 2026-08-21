import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSupportTicketAction,
  PartnerSupportActions,
  SupportAttachmentUpload,
  SupportReplyForm,
  SupportTicketSummary,
} from "@/src/modules/partner-support";
import { supportCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
export default async function SupportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<{ created?: string; attachment?: string }>;
}) {
  const [{ ticketId }, query, locale] = await Promise.all([
    params,
    searchParams,
    getPartnerLocale(),
  ]);
  const copy = supportCopy(locale);
  const result = await getSupportTicketAction(ticketId);
  if (!result.success || !result.data) notFound();
  const detail = result.data;
  const immutable = ["closed", "rejected", "cancelled"].includes(detail.status);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <Link
          className="text-sm font-medium text-emerald-700"
          href="/cabinet/support"
        >
          ← {copy.backTickets}
        </Link>
        <p className="mt-4 text-xs font-semibold uppercase text-emerald-700">
          {copy.title}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{detail.ticketNumber}</h1>
        {query.created === "1" ? (
          <p
            aria-live="polite"
            className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            {copy.created}
          </p>
        ) : null}
        {query.attachment === "failed" ? (
          <p
            aria-live="polite"
            className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {copy.attachmentFailed}
          </p>
        ) : null}
      </header>
      <SupportTicketSummary detail={detail} locale={locale} />
      <PartnerSupportActions detail={detail} />
      {!immutable ? (
        <section className="grid gap-8 border-t border-zinc-200 pt-6 md:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold">{copy.reply}</h2>
            <div className="mt-3">
              <SupportReplyForm detail={detail} />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold">{copy.addMaterial}</h2>
            <div className="mt-3">
              <SupportAttachmentUpload ticketId={detail.id} />
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
