import { agentLifecycleStatusCopy, createAgentCabinetService, getAgentCabinetLocale } from "@/src/modules/agent-cabinet";
import { AgentPageHeader } from "@/src/modules/agent-cabinet/components/PageHeader";
import { ProfileForm } from "@/src/modules/agent-cabinet/components/ProfileForm";
import { cabinetPageNarrow } from "@/src/modules/cabinet-experience/components";

export default async function AgentProfilePage() {
  const [context, locale] = await Promise.all([createAgentCabinetService().context(), getAgentCabinetLocale()]);
  if (!context) return null;
  const ro = locale === "ro";

  return <main className={cabinetPageNarrow}>
    <AgentPageHeader title={ro ? "Profil" : "Профиль"} description={ro ? "Date de contact și informații de lucru." : "Контактные и рабочие данные."} />
    <dl className="grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 sm:grid-cols-3">
      <ProfileValue label={ro ? "Nume" : "Имя"} value={context.legalName ?? context.displayName} />
      <ProfileValue label={ro ? "Cod agent" : "Код агента"} value={context.agentCode} mono />
      <ProfileValue label={ro ? "Stare operațională" : "Рабочий статус"} value={agentLifecycleStatusCopy[locale][context.status]} />
    </dl>
    <section>
      <h2 className="mb-3 text-lg font-semibold tracking-tight">{ro ? "Date de contact" : "Контактные данные"}</h2>
      <ProfileForm context={context} locale={locale} />
    </section>
  </main>;
}

function ProfileValue({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="bg-white p-4"><dt className="text-xs text-zinc-500">{label}</dt><dd className={`mt-1 text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</dd></div>;
}
