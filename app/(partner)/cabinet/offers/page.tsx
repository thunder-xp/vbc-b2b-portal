import Link from "next/link";
import { redirect } from "next/navigation";

import { listPartnerCampaignsAction } from "@/src/modules/commercial-campaigns/actions";
import { CampaignCard } from "@/src/modules/commercial-campaigns/components";
import type { CampaignFilter } from "@/src/modules/commercial-campaigns/types";

const FILTERS: Array<{ value: CampaignFilter; label: string }> = [
  { value: "active", label: "Активные" }, { value: "ending", label: "Заканчиваются скоро" },
  { value: "stock", label: "В наличии" }, { value: "arrivals", label: "Поступления" },
  { value: "purchased", label: "Ранее покупали" },
];

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ filter?: string; page?: string }> }) {
  const params = await searchParams;
  const filter = FILTERS.some((item) => item.value === params.filter) ? params.filter as CampaignFilter : "active";
  const page = Math.max(1, Number(params.page) || 1);
  const result = await listPartnerCampaignsAction({ filter, page, pageSize: 20 });
  if (!result.success && result.message.includes("вход")) redirect("/auth/sign-in");
  return <div className="space-y-6">
    <header className="border-b border-zinc-200 pb-5"><p className="text-xs font-semibold uppercase text-emerald-700">Предложения для вашей компании</p><h1 className="mt-1 text-2xl font-semibold text-zinc-950 sm:text-3xl">Специальные предложения</h1><p className="mt-2 max-w-3xl text-sm text-zinc-600">Актуальные товары и условия для вашей компании. Цены и наличие проверяются при каждом открытии.</p></header>
    <nav aria-label="Фильтры предложений" className="flex max-w-full gap-2 overflow-x-auto pb-1">{FILTERS.map((item) => <Link aria-current={filter === item.value ? "page" : undefined} className={`flex min-h-11 shrink-0 items-center rounded-md border px-3 text-sm font-semibold ${filter === item.value ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-zinc-300 bg-white"}`} href={item.value === "active" ? "/cabinet/offers" : `/cabinet/offers?filter=${item.value}`} key={item.value} prefetch={false}>{item.label}</Link>)}</nav>
    {!result.success ? <section className="border border-rose-200 bg-rose-50 p-5" role="alert">{result.message}</section> : result.data.items.length ? <div className="grid gap-4">{result.data.items.map((campaign) => <CampaignCard campaign={campaign} key={campaign.id} />)}</div> : <section className="border border-dashed border-zinc-300 bg-white px-6 py-12 text-center"><h2 className="font-semibold">Сейчас предложений нет</h2><p className="mt-1 text-sm text-zinc-600">Новые релевантные предложения появятся здесь.</p></section>}
    {result.success ? <nav className="flex items-center justify-between border-t border-zinc-200 pt-4 text-sm">{page > 1 ? <Link href={`/cabinet/offers?filter=${filter}&page=${page - 1}`}>Назад</Link> : <span />}<span>Страница {page} из {result.data.totalPages}</span>{page < result.data.totalPages ? <Link href={`/cabinet/offers?filter=${filter}&page=${page + 1}`}>Далее</Link> : <span />}</nav> : null}
  </div>;
}
