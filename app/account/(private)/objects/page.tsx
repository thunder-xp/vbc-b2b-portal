import { Archive, ArrowRight, Building2, Plus } from "lucide-react";
import Link from "next/link";

import { SectionHeader, WorkspaceHeader, cabinetPage, cabinetPrimaryAction, cabinetSecondaryAction, cabinetSurface, cabinetTextAction } from "@/src/modules/cabinet-experience/components";
import { CustomerEmptyState, PurchaseObjectAssignment } from "@/src/modules/final-customer/components";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { customerObjectStatusLabel, customerObjectTypeLabels } from "@/src/modules/final-customer/object-copy";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";

export default async function CustomerObjectsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const [context, locale, query] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale(), searchParams]);
  const includeArchived = query.archived === "1";
  const workspace = await createFinalCustomerService().customerObjectWorkspace(context.account, includeArchived);
  const ro = locale === "ro";
  const activeObjects = workspace.objects.filter((object) => object.status === "ACTIVE");
  const archivedCount = workspace.objects.filter((object) => object.status === "ARCHIVED").length;
  return <main className={cabinetPage}>
    <WorkspaceHeader
      eyebrow={ro ? "Pașaport digital de securitate" : "Цифровой паспорт безопасности"}
      title={ro ? "Obiectele mele" : "Мои объекты"}
      description={ro ? "Organizați cumpărăturile, documentele și solicitările de service după casă, apartament sau afacere." : "Объединяйте покупки, документы и сервис по дому, квартире или бизнесу."}
      actions={<Link className={cabinetPrimaryAction} href="/account/objects/new"><Plus aria-hidden className="size-4" />{ro ? "Creează obiect" : "Создать объект"}</Link>}
    />

    {workspace.unlinkedPurchases[0] ? <div className="space-y-2"><p className="text-sm font-medium text-amber-800">{ro ? `${workspace.unlinkedPurchaseCount} cumpărături așteaptă asocierea` : `${workspace.unlinkedPurchaseCount} покупок ожидают привязки`}</p><PurchaseObjectAssignment locale={locale} objects={activeObjects} orderId={workspace.unlinkedPurchases[0].orderId} orderNumber={workspace.unlinkedPurchases[0].orderNumber} /></div> : null}

    {workspace.objects.length ? <section className="space-y-3">
      <SectionHeader title={includeArchived ? (ro ? "Obiecte active și arhivate" : "Активные и архивные объекты") : (ro ? "Obiecte active" : "Активные объекты")} />
      <div className="grid gap-3 md:grid-cols-2">{workspace.objects.map((object) => <Link className={`group grid min-h-32 gap-3 p-4 ${cabinetSurface}`} href={`/account/objects/${object.id}`} key={object.id}>
        <div className="flex min-w-0 items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Building2 aria-hidden className="size-5" /></span><span className="min-w-0 flex-1"><strong className="block truncate">{object.name}</strong><span className="mt-1 block text-sm text-zinc-500">{customerObjectTypeLabels[locale][object.objectType]}{object.locality ? ` · ${object.locality}` : ""}</span></span><ArrowRight aria-hidden className="size-4 text-zinc-400 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" /></div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600"><span>{ro ? `Cumpărături: ${object.purchaseCount}` : `Покупки: ${object.purchaseCount}`}</span><span>{ro ? `Produse: ${object.productCount}` : `Товары: ${object.productCount}`}</span>{object.openServiceCount ? <span className="font-medium text-amber-700">{ro ? `Service deschis: ${object.openServiceCount}` : `Открытый сервис: ${object.openServiceCount}`}</span> : null}{object.status === "ARCHIVED" ? <span>{customerObjectStatusLabel(object.status, locale)}</span> : null}</div>
      </Link>)}</div>
    </section> : <CustomerEmptyState body={ro ? "Creați un obiect pentru a uni cumpărăturile, documentele și service-ul într-un singur loc." : "Создайте объект, чтобы объединить покупки, документы и сервис."} locale={locale} primaryHref="/account/objects/new" primaryLabel={ro ? "Creează obiect" : "Создать объект"} showService={false} title={ro ? "Nu aveți obiecte" : "Объектов пока нет"} />}

    <div className="flex flex-wrap gap-2 border-t border-zinc-200 pt-4">
      <Link className={includeArchived ? cabinetSecondaryAction : cabinetTextAction} href={includeArchived ? "/account/objects" : "/account/objects?archived=1"}><Archive aria-hidden className="size-4" />{includeArchived ? (ro ? "Doar active" : "Только активные") : (ro ? "Arhivă" : "Архив")}{includeArchived && archivedCount ? ` (${archivedCount})` : ""}</Link>
    </div>
  </main>;
}
