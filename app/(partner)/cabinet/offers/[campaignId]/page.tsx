import { CalendarClock, PackageCheck, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPartnerCampaignAction } from "@/src/modules/commercial-campaigns/actions";
import { CampaignCartControl } from "@/src/modules/commercial-campaigns/components";

export default async function OfferDetailPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const result = await getPartnerCampaignAction(campaignId);
  if (!result.success) notFound();
  const campaign = result.data;
  return <div className="space-y-6">
    <header className="grid overflow-hidden rounded-md border border-zinc-200 bg-white lg:grid-cols-[minmax(0,1fr)_24rem]"><div className="p-6"><Link className="text-sm font-semibold text-emerald-700" href="/cabinet/offers">← Все предложения</Link><p className="mt-5 text-xs font-semibold uppercase text-emerald-700">Специальное предложение</p><h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{campaign.title}</h1><p className="mt-3 max-w-3xl text-zinc-600">{campaign.description}</p><p className="mt-5 inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900"><CalendarClock className="size-4" />Доступно до {formatDate(campaign.endsAt)}</p></div>{campaign.imageAssetPath ? <div className="relative min-h-56 bg-zinc-100"><Image alt="" className="object-cover" fill priority sizes="(max-width:1024px) 100vw,384px" src={campaign.imageAssetPath} /></div> : null}</header>
    <section aria-labelledby="campaign-products"><h2 className="text-xl font-semibold" id="campaign-products">Товары предложения</h2><div className="mt-3 grid gap-4 xl:grid-cols-2">{campaign.products.map((product) => <article className="grid min-w-0 gap-4 rounded-md border border-zinc-200 bg-white p-4 sm:grid-cols-[7rem_1fr]" key={product.itemId}>{product.imageUrl ? <div className="relative aspect-square overflow-hidden rounded bg-zinc-50"><Image alt="" className="object-contain p-2" fill sizes="112px" src={product.imageUrl} /></div> : <div className="flex aspect-square items-center justify-center bg-zinc-50 text-zinc-400"><PackageCheck /></div>}<div className="min-w-0"><p className="text-xs font-semibold text-zinc-500">SKU {product.sku}</p><Link className="mt-1 block font-semibold text-zinc-950 hover:text-emerald-700" href={`/cabinet/catalog/${product.slug}`} prefetch={false}>{product.name}</Link>{product.price ? <p className="mt-3 text-lg font-semibold">Ваша цена: {formatMoney(product.price.amount, product.price.currency)}</p> : <p className="mt-3 text-sm font-medium text-zinc-600">Цена уточняется</p>}<p className="mt-2 flex items-center gap-1.5 text-sm">{(product.availableQuantity ?? 0) > 0 ? <><PackageCheck className="size-4 text-emerald-700" />В наличии: {product.availableQuantity} шт.</> : product.expectedArrivalDate ? <><Truck className="size-4 text-amber-700" />Ожидается к поступлению — {formatDate(product.expectedArrivalDate)}</> : <>Наличие уточняется</>}</p>{product.partnerMessage ? <p className="mt-2 text-sm text-zinc-600">{product.partnerMessage}</p> : null}<p className="mt-2 text-xs text-zinc-500">Минимум: {product.minimumQuantity} шт.{product.maximumQuantityPerCompany ? ` · Лимит компании: ${product.maximumQuantityPerCompany} шт.` : ""}</p><CampaignCartControl itemId={product.itemId} maximum={product.maximumQuantityPerCompany} minimum={product.minimumQuantity} /></div></article>)}</div></section>
    <section className="rounded-md border border-zinc-200 bg-zinc-50 p-5"><h2 className="font-semibold">Условия</h2><p className="mt-2 text-sm text-zinc-700">{campaign.termsSummary}</p><p className="mt-2 text-sm text-zinc-600">Количество ограничено текущим остатком. Товар кампанией не резервируется.</p></section>
  </div>;
}
function formatDate(value: string) { return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(value)); }
function formatMoney(amount: number, currency: string) { return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(amount); }
