import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicReferralForm, createAgentDomainService } from "@/src/modules/agent-domain";

export const metadata: Metadata = { title: "Заявка клиента | Novotech", robots: { index: false, follow: false } };

export default async function AgentReferralLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await createAgentDomainService().isReferralTokenAvailable(token))) notFound();
  return <main className="min-h-screen bg-zinc-50 px-4 py-10"><div className="mx-auto max-w-2xl"><div className="mb-6"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Novotech</p><h1 className="mt-1 text-3xl font-semibold text-zinc-950">Запрос на консультацию</h1><p className="mt-2 text-sm text-zinc-600">Оставьте минимальные контактные данные и кратко опишите задачу.</p></div><PublicReferralForm token={token} /></div></main>;
}
