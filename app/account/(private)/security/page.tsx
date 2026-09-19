import { finalCustomerCopy, getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { WorkspaceHeader, cabinetPage, cabinetSurface } from "@/src/modules/cabinet-experience/components";

export default async function FinalCustomerSecurityPage() {
  const [context, locale] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale()]);
  const copy = finalCustomerCopy[locale];
  return (
    <main className={cabinetPage}>
      <WorkspaceHeader title={copy.security} />
      <section className={`grid max-w-2xl divide-y divide-zinc-200 ${cabinetSurface}`}>
        <div className="p-5"><p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{copy.smsLogin}</p><p className="mt-2 font-mono text-sm font-semibold">{context.verifiedPhone}</p></div>
        <div className="p-5"><p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{copy.assurance}</p><p className="mt-2 text-sm font-semibold">{copy.smsLogin}</p></div>
        <p className="p-5 text-sm leading-6 text-zinc-600">{copy.futureMfa}</p>
      </section>
    </main>
  );
}
