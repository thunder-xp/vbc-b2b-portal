import Link from "next/link";

import { PurchaseTemplateCreateForm } from "@/src/modules/purchase-templates/components";
import { procurementCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function NewPurchaseTemplatePage() {
  const copy = procurementCopy(await getPartnerLocale());
  return (
    <div className="space-y-6">
      <header className="border-b border-zinc-200 pb-5">
        <Link
          className="text-sm font-medium text-emerald-700"
          href="/cabinet/purchase-templates"
          prefetch={false}
        >
          ← {copy.templates}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{copy.newTemplateTitle}</h1>
        <p className="mt-2 text-sm text-zinc-600">{copy.newTemplateHint}</p>
      </header>
      <PurchaseTemplateCreateForm />
    </div>
  );
}
