import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { customerDate } from "@/src/modules/final-customer/presentation";
import { CustomerPager } from "@/src/modules/final-customer/components";

export default async function EquipmentPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [context, locale] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale()]);
  const page = positivePage((await searchParams).page); const pageSize = 20;
  const result = await createFinalCustomerService().equipment(context.account, pageSize + 1, (page - 1) * pageSize);
  const equipment = result.slice(0, pageSize); const hasNext = result.length > pageSize;
  const ro = locale === "ro";
  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8"><header><h1 className="text-2xl font-semibold">{ro ? "Echipamente și garanție" : "Оборудование и гарантия"}</h1><p className="mt-1 text-sm text-zinc-600">{ro ? "Echipamente confirmate prin cumpărare. Termenul personal de garanție este afișat numai dacă există o sursă verificată." : "Оборудование из подтверждённых покупок. Персональный срок гарантии показывается только при наличии подтверждённого источника."}</p></header>{equipment.length ? <ul className="grid gap-3 sm:grid-cols-2">{equipment.map((line) => <li key={line.id}><Link className="grid min-h-28 grid-cols-[56px_1fr_auto] items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 hover:border-emerald-300" href={`/account/equipment/${line.id}`}><div className="relative size-14 overflow-hidden rounded-lg bg-zinc-100">{(line.currentProduct?.imageUrl ?? line.imageUrl) ? <Image alt="" fill className="object-contain p-1" sizes="56px" src={line.currentProduct?.imageUrl ?? line.imageUrl ?? ""} /> : null}</div><div><p className="font-semibold">{line.name}</p><p className="mt-1 text-xs text-zinc-500">SKU {line.sku}</p><p className="mt-1 text-xs text-zinc-500">{customerDate(line.purchasedAt, locale)}</p></div><ArrowRight aria-hidden className="size-4" /></Link></li>)}</ul> : <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500">{ro ? "Echipamentele cumpărate vor apărea aici." : "Купленное оборудование появится здесь."}</p>}<CustomerPager hasNext={hasNext} page={page} path="/account/equipment" ro={ro} /></main>;
}
function positivePage(value?: string) { const page = Number(value); return Number.isInteger(page) && page > 0 ? Math.min(page, 1000) : 1; }
