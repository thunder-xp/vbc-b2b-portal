import Link from "next/link";

import { requireAdminPagePermission } from "@/src/modules/admin";
import { createAgentDomainService, reviewAgentReferralAction } from "@/src/modules/agent-domain";

export default async function AdminAgentReferralsPage() {
  const context = await requireAdminPagePermission("admin.agents.view");
  const referrals = await createAgentDomainService().listReferrals();
  const canManage = context.permissions.includes("admin.agents.manage");
  return <main className="space-y-6"><header><Link className="text-sm font-semibold text-emerald-800 hover:underline" href="/admin/agents">← Агенты</Link><h1 className="mt-3 text-3xl font-semibold">Реферальные заявки</h1><p className="mt-2 text-sm text-zinc-600">Проверка согласия, identity resolution и eligibility выполняются до активации 90-дневной атрибуции.</p></header><section className="space-y-3">{referrals.map((referral) => <article className="rounded-lg border border-zinc-200 bg-white p-5" key={referral.id}><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-zinc-500">{referral.agentCode} · {referral.agentDisplayName}</p><h2 className="mt-1 text-lg font-semibold">{referral.name}</h2><p className="mt-1 text-sm text-zinc-600">{referral.needSummary}</p></div><div className="text-right"><p className="font-semibold">{referral.status}</p><p className="text-xs text-zinc-500">{referral.identityResolutionStatus} · {referral.identityResolutionReason}</p></div></div><dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3"><div><dt className="text-zinc-500">Контакт</dt><dd>{referral.phone ?? referral.email ?? "—"}</dd></div><div><dt className="text-zinc-500">Customer identity</dt><dd className="font-mono text-xs">{referral.customerIdentityId ?? "требует разрешения"}</dd></div><div><dt className="text-zinc-500">Получено</dt><dd>{new Date(referral.submittedAt).toLocaleString("ru-RU")}</dd></div></dl>{canManage ? <div className="mt-4 flex flex-wrap gap-2">{actionButtons(referral.status).map(([action, label, primary]) => <form action={reviewAgentReferralAction} key={action}><input name="referralId" type="hidden" value={referral.id} /><input name="action" type="hidden" value={action} /><button className={primary ? "min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" : "min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold"} type="submit">{label}</button></form>)}</div> : null}</article>)}{referrals.length === 0 ? <p className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Заявок пока нет.</p> : null}</section></main>;
}

function actionButtons(status: string): readonly (readonly [string, string, boolean])[] {
  if (status === "CAPTURED") return [["REVIEW", "Начать проверку", true], ["REJECT", "Отклонить", false]];
  if (status === "PENDING_REVIEW") return [["VERIFY", "Подтвердить", true], ["REJECT", "Отклонить", false]];
  if (status === "VERIFIED") return [["ACTIVATE", "Активировать атрибуцию", true]];
  return [];
}
