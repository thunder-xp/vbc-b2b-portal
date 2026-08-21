import Link from "next/link";
import { PurchasingListCreateForm } from "@/src/modules/purchasing-lists/components";
import { procurementCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function NewPurchasingListPage() {
  const copy = procurementCopy(await getPartnerLocale());
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="border-b border-zinc-200 pb-5">
        <Link
          className="text-sm font-semibold text-emerald-700"
          href="/cabinet/purchasing-lists"
        >
          ← {copy.favorites}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{copy.newList}</h1>
        <p className="mt-1 text-sm text-zinc-500">{copy.newListHint}</p>
      </header>
      <PurchasingListCreateForm />
    </div>
  );
}
