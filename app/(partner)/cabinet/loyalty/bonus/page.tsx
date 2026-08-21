import { Gift } from "lucide-react";
import { secondaryCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function BonusProgramPage() {
  const copy = secondaryCopy(await getPartnerLocale());
  return (
    <main className="mx-auto max-w-4xl space-y-5">
      <header className="border-b border-zinc-200 pb-5">
        <p className="text-xs font-semibold uppercase text-emerald-700">
          {copy.loyaltyEyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950">
          {copy.bonusTitle}
        </h1>
      </header>
      <section className="border border-zinc-200 bg-white p-6">
        <Gift aria-hidden="true" className="size-7 text-emerald-700" />
        <h2 className="mt-4 font-semibold text-zinc-950">{copy.programInfo}</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600">
          {copy.bonusDescription}
        </p>
      </section>
    </main>
  );
}
