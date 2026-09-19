import { ArrowRight, CheckCircle2, CircleDot, ShieldCheck } from "lucide-react";

import { WorkspaceHeader, cabinetPrimaryAction } from "@/src/modules/cabinet-experience/components";
import { agentCabinetCopy, agentComplianceCopy, agentLifecycleStatusCopy, type AgentCabinetLocale } from "../copy";
import { agentOnboardingReadiness, type AgentOnboardingNextAction, type AgentOnboardingRequirement } from "../operational-presentation";
import type { AgentCabinetContext } from "../types";

export function StatusGate({ context, locale }: { context: AgentCabinetContext; locale: AgentCabinetLocale }) {
  const copy = agentCabinetCopy[locale];
  const readiness = agentOnboardingReadiness(context);
  const labels = requirementLabels[locale];
  const next = nextActionCopy[locale][readiness.nextAction];
  const body = readiness.terminal
    ? (locale === "ro" ? "Cabinetul operațional nu este disponibil. Istoricul colaborării este păstrat." : "Операционный кабинет недоступен. История сотрудничества сохранена.")
    : context.status === "SUSPENDED"
      ? (locale === "ro" ? "Acțiunile operaționale sunt suspendate temporar." : "Операционные действия временно отключены.")
      : (locale === "ro" ? "Vedeți etapa curentă și ce urmează." : "Текущий этап и оставшиеся требования.");

  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-8">
    <WorkspaceHeader eyebrow={copy.currentStage} title={copy.onboardingTitle} description={body} />
    <section className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-4">
        <div><p className="text-xs text-zinc-500">{copy.currentStage}</p><p className="mt-1 font-semibold">{agentLifecycleStatusCopy[locale][context.status]}</p></div>
        <div className="text-right"><p className="text-xs text-zinc-500">{copy.verification}</p><p className="mt-1 text-sm font-semibold">{agentComplianceCopy[locale][context.complianceStatus]}</p></div>
      </div>
      <h2 className="mt-5 font-semibold">{locale === "ro" ? "Cerințe" : "Требования"}</h2>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        {readiness.items.map((item) => <li className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm ${item.complete ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-zinc-200 text-zinc-700"}`} key={item.code}>
          {item.complete ? <CheckCircle2 aria-hidden className="size-4 shrink-0 text-emerald-700" /> : <CircleDot aria-hidden className="size-4 shrink-0 text-zinc-400" />}
          <span>{labels[item.code]}</span>
          <span className="ml-auto text-xs font-semibold">{item.complete ? (locale === "ro" ? "Gata" : "Готово") : (locale === "ro" ? "Urmează" : "Далее")}</span>
        </li>)}
      </ol>
      {readiness.nextAction !== "NONE" ? <div className="mt-5 flex flex-col gap-3 rounded-lg bg-zinc-50 p-4 sm:flex-row sm:items-center">
        <ShieldCheck aria-hidden className="size-5 shrink-0 text-emerald-700" />
        <div className="flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{copy.nextStep}</p><p className="mt-1 text-sm text-zinc-700">{next}</p></div>
        {readiness.nextAction === "CONTACT_COORDINATOR" ? <a className={cabinetPrimaryAction} href="mailto:info@novotech.md">{copy.contactCoordinator}<ArrowRight aria-hidden className="size-4" /></a> : null}
      </div> : null}
    </section>
  </main>;
}

const requirementLabels: Record<AgentCabinetLocale, Record<AgentOnboardingRequirement, string>> = {
  ru: { APPLICATION: "Заявка получена", COMPLIANCE: "Проверка данных", CONTRACT: "Договор готов", ACTIVATION: "Кабинет активирован" },
  ro: { APPLICATION: "Cerere primită", COMPLIANCE: "Verificarea datelor", CONTRACT: "Contract pregătit", ACTIVATION: "Cabinet activat" },
};

const nextActionCopy: Record<AgentCabinetLocale, Record<AgentOnboardingNextAction, string>> = {
  ru: {
    WAIT_REVIEW: "Novotech проверяет данные заявки. От вас пока не требуется действие.",
    CONTACT_COORDINATOR: "Свяжитесь с координатором Novotech и уточните требуемые данные.",
    WAIT_CONTRACT: "Novotech готовит договор. От вас пока не требуется действие.",
    WAIT_ACTIVATION: "Novotech завершает активацию кабинета.",
    NONE: "",
  },
  ro: {
    WAIT_REVIEW: "Novotech verifică datele cererii. Momentan nu este necesară nicio acțiune din partea dvs.",
    CONTACT_COORDINATOR: "Contactați coordonatorul Novotech pentru a clarifica datele necesare.",
    WAIT_CONTRACT: "Novotech pregătește contractul. Momentan nu este necesară nicio acțiune din partea dvs.",
    WAIT_ACTIVATION: "Novotech finalizează activarea cabinetului.",
    NONE: "",
  },
};
