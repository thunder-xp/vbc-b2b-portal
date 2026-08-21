import { randomUUID } from "node:crypto";
import Link from "next/link";
import { supportCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import { SupportTicketForm } from "@/src/modules/partner-support";
export default async function NewSupportTicketPage() {
  const locale = await getPartnerLocale();
  const copy = supportCopy(locale);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Link
          className="text-sm font-medium text-emerald-700"
          href="/cabinet/support"
        >
          ← {copy.backToTickets}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">{copy.newTitle}</h1>
        <p className="mt-2 text-sm text-zinc-600">{copy.newHint}</p>
      </header>
      <SupportTicketForm idempotencyKey={randomUUID()} />
    </div>
  );
}
