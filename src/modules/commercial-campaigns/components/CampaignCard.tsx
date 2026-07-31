import { CalendarClock, PackageCheck, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { PartnerCampaign } from "../types";

export function CampaignCard({ campaign }: { campaign: PartnerCampaign }) {
  const stocked = campaign.products.filter((product) => (product.availableQuantity ?? 0) > 0).length;
  const arriving = campaign.products.filter((product) => product.expectedArrivalDate).length;
  return <article className="grid min-w-0 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm sm:grid-cols-[11rem_1fr]">
    <div className="relative aspect-[16/9] bg-zinc-100 sm:aspect-auto sm:min-h-48">
      {campaign.imageAssetPath ? <Image alt="" className="object-cover" fill sizes="(max-width:640px) 100vw,176px" src={campaign.imageAssetPath} /> : <div className="flex h-full items-center justify-center text-zinc-400"><PackageCheck aria-hidden="true" className="size-10" /></div>}
    </div>
    <div className="min-w-0 p-5">
      <p className="text-xs font-semibold uppercase text-emerald-700">Специальное предложение</p>
      <h2 className="mt-1 text-xl font-semibold text-zinc-950">{campaign.title}</h2>
      <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{campaign.description}</p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-zinc-700">
        <span className="inline-flex items-center gap-1.5"><CalendarClock aria-hidden="true" className="size-4 text-emerald-700" />Доступно до {formatDate(campaign.endsAt)}</span>
        {stocked ? <span className="inline-flex items-center gap-1.5"><PackageCheck aria-hidden="true" className="size-4" />В наличии: {stocked}</span> : null}
        {arriving ? <span className="inline-flex items-center gap-1.5"><Truck aria-hidden="true" className="size-4" />К поступлению: {arriving}</span> : null}
      </div>
      <Link className="mt-5 inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2" href={`/cabinet/offers/${campaign.id}`} prefetch={false}>Открыть предложение</Link>
    </div>
  </article>;
}

function formatDate(value: string) { return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(value)); }
