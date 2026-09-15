import { randomUUID } from "node:crypto";
import Link from "next/link";
import { getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { createInstallationProjectAction } from "@/src/modules/installation-marketplace/actions";
import { getInstallationMarketplaceService } from "@/src/modules/installation-marketplace/server";
import { INSTALLATION_NEED_TYPES, INSTALLATION_OBJECT_TYPES } from "@/src/modules/installation-marketplace/types";
import { marketplaceCopy, needLabels, objectLabels } from "@/src/modules/installation-marketplace/copy";

type Query={productId?:string;orderId?:string};
export default async function NewCustomerInstallationPage({searchParams}:{searchParams:Promise<Query>}){
  const [,locale,query]=await Promise.all([getFinalCustomerContext(),getFinalCustomerLocale(),searchParams]);
  const copy=marketplaceCopy[locale];
  const sourceType=query.orderId?"ORDER":query.productId?"PRODUCT":"CUSTOM";
  const regions=await getInstallationMarketplaceService().listRegions(locale);
  return <main className="mx-auto max-w-2xl px-4 py-6 sm:py-8"><Link className="text-sm font-semibold text-emerald-700" href="/account/installations">← {copy.projects}</Link><h1 className="mt-3 text-2xl font-semibold">{copy.newProject}</h1><p className="mt-2 text-sm text-zinc-600">{locale==="ro"?"Datele de contact vor fi comunicate numai partenerului care acceptă cererea.":"Контактные данные будут переданы только партнёру, который примет заявку."}</p>
    <form action={createInstallationProjectAction} className="mt-6 grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
      <input name="sourceType" type="hidden" value={sourceType}/><input name="sourceOrderId" type="hidden" value={query.orderId??""}/><input name="sourcePublicProductId" type="hidden" value={query.productId??""}/><input name="creationKey" type="hidden" value={randomUUID()}/>
      <label className="grid gap-1 text-sm font-medium">{copy.objectType}<select className="min-h-11 rounded-md border border-zinc-300 px-3" name="objectType" required>{INSTALLATION_OBJECT_TYPES.map(value=><option key={value} value={value}>{objectLabels[locale][value]}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-medium">{copy.needType}<select className="min-h-11 rounded-md border border-zinc-300 px-3" name="needType" required>{INSTALLATION_NEED_TYPES.map(value=><option key={value} value={value}>{needLabels[locale][value]}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-medium">{locale==="ro"?"Regiunea de deservire":"Зона обслуживания"}<select className="min-h-11 rounded-md border border-zinc-300 px-3" name="regionCode"><option value="">{locale==="ro"?"Orice zonă disponibilă":"Любая доступная зона"}</option>{regions.map(region=><option key={region.code} value={region.code}>{region.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-medium">{copy.locality}<input className="min-h-11 rounded-md border border-zinc-300 px-3" maxLength={160} minLength={2} name="locality" required/></label>
      <label className="grid gap-1 text-sm font-medium">{copy.description}<textarea className="min-h-24 rounded-md border border-zinc-300 p-3" maxLength={1000} name="description"/></label>
      <label className="flex items-start gap-3 rounded-lg bg-zinc-50 p-3 text-sm"><input className="mt-0.5 size-5" name="contactConsent" required type="checkbox"/><span>{copy.consent}</span></label>
      <button className="min-h-11 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white">{copy.create}</button>
    </form>
  </main>;
}
