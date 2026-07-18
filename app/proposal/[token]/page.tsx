import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";

import { ProposalDocument } from "@/src/modules/estimates/components/ProposalDocument";
import { PublicProposalResponse } from "@/src/modules/estimates/components/PublicProposalResponse";
import { createProposalDeliveryService } from "@/src/modules/estimates/actions/service-factory";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Коммерческое предложение", robots: { index: false, follow: false } };

export default async function PublicProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const service = createProposalDeliveryService();
  const delivery = await loadProposal(token);
  if (!delivery) {
    return <main className="grid min-h-screen place-items-center bg-zinc-100 p-6"><section className="max-w-lg bg-white p-8 text-center shadow-sm"><h1 className="text-xl font-semibold">Предложение недоступно</h1><p className="mt-3 text-sm leading-6 text-zinc-600">Ссылка неверна, отозвана или срок её действия истёк. Запросите новую ссылку у отправителя.</p></section></main>;
  }
  after(() => service.trackOpen(token, delivery));
  const downloadLabel = delivery.locale === "ro" ? "Descărcați PDF" : "Скачать PDF";
  return <main className="min-h-screen bg-zinc-100 pb-10">
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur"><div className="mx-auto flex max-w-[210mm] items-center justify-between gap-3"><strong className="text-emerald-800">NOVOTECH SYSTEMS</strong><Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-900" href={`/api/proposals/${token}/pdf`}>{downloadLabel}</Link></div></header>
    <ProposalDocument proposal={delivery.proposal} />
    <PublicProposalResponse initialResponse={delivery.response} locale={delivery.locale} token={token} />
  </main>;
}

async function loadProposal(token: string) {
  try { return await createProposalDeliveryService().getPublic(token); }
  catch { return null; }
}
