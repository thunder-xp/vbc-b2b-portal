import { ArrowRight, CheckCircle2, CircleDot, ShieldCheck } from "lucide-react";

import { WorkspaceHeader, cabinetPrimaryAction } from "@/src/modules/cabinet-experience/components";
import { agentCabinetCopy, agentComplianceCopy, agentLifecycleStatusCopy, type AgentCabinetLocale } from "../copy";
import type { AgentCabinetContext } from "../types";

export function StatusGate({ context, locale }: { context: AgentCabinetContext; locale: AgentCabinetLocale }) {
  const copy = agentCabinetCopy[locale];
  const terminal = context.status === "TERMINATED" || context.status === "REJECTED";
  const activeStep = onboardingStep(context.status);
  const steps = locale === "ro"
    ? ["Cerere", "Verificare", "Contract", "Activare"]
    : ["Заявка", "Проверка", "Договор", "Активация"];
  const body = terminal
    ? (locale === "ro" ? "Cabinetul operațional nu este disponibil. Istoricul colaborării este păstrat." : "Операционный кабинет недоступен. История сотрудничества сохранена.")
    : context.status === "SUSPENDED"
      ? (locale === "ro" ? "Acțiunile operaționale sunt suspendate temporar. Contactați coordonatorul Novotech." : "Операционные действия временно отключены. Обратитесь к координатору Novotech.")
      : copy.onboardingBody;
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:py-10"><WorkspaceHeader eyebrow={copy.currentStage} title={copy.onboardingTitle} description={body}/><section className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6"><ol className="grid gap-3 sm:grid-cols-4">{steps.map((step,index)=>{const done=index<activeStep;const current=index===activeStep;return <li className={`flex items-center gap-2 rounded-lg border px-3 py-3 text-sm ${current?"border-emerald-300 bg-emerald-50 font-semibold":"border-zinc-200 text-zinc-600"}`} key={step}>{done?<CheckCircle2 aria-hidden className="size-4 text-emerald-700"/>:current?<CircleDot aria-hidden className="size-4 text-emerald-700"/>:<span aria-hidden className="size-4 rounded-full border border-zinc-300"/>}{step}</li>})}</ol><dl className="mt-5 grid gap-3 border-t border-zinc-200 pt-5 sm:grid-cols-2"><div><dt className="text-xs text-zinc-500">{copy.currentStage}</dt><dd className="mt-1 text-sm font-semibold">{agentLifecycleStatusCopy[locale][context.status]}</dd></div><div><dt className="text-xs text-zinc-500">{copy.verification}</dt><dd className="mt-1 text-sm font-semibold">{agentComplianceCopy[locale][context.complianceStatus]}</dd></div></dl>{!terminal?<div className="mt-5 flex flex-col gap-4 rounded-lg bg-zinc-50 p-4 sm:flex-row sm:items-center"><ShieldCheck aria-hidden className="size-5 shrink-0 text-emerald-700"/><p className="flex-1 text-sm text-zinc-700">{copy.onboardingBody}</p><a className={cabinetPrimaryAction} href="mailto:info@novotech.md">{copy.contactCoordinator}<ArrowRight aria-hidden className="size-4"/></a></div>:null}</section></main>;
}

function onboardingStep(status: AgentCabinetContext["status"]) {
  if (status === "APPLIED") return 0;
  if (status === "COMPLIANCE_REVIEW") return 1;
  if (status === "CONTRACT_PENDING") return 2;
  return 3;
}
