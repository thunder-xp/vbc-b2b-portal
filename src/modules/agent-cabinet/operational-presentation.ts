import type { AgentCabinetLocale } from "./copy";
import type { AgentCabinetContext, AgentClientView, AgentReferralView } from "./types";

export type AgentOnboardingRequirement = "APPLICATION" | "COMPLIANCE" | "CONTRACT" | "ACTIVATION";
export type AgentOnboardingNextAction = "WAIT_REVIEW" | "CONTACT_COORDINATOR" | "WAIT_CONTRACT" | "WAIT_ACTIVATION" | "NONE";

export function agentOnboardingReadiness(context: AgentCabinetContext) {
  const terminal = context.status === "TERMINATED" || context.status === "REJECTED";
  const items: ReadonlyArray<{ code: AgentOnboardingRequirement; complete: boolean }> = [
    { code: "APPLICATION", complete: true },
    { code: "COMPLIANCE", complete: context.complianceStatus === "APPROVED" },
    { code: "CONTRACT", complete: context.contractReady },
    { code: "ACTIVATION", complete: context.status === "ACTIVE" },
  ];
  let nextAction: AgentOnboardingNextAction = "WAIT_ACTIVATION";
  if (terminal || context.status === "ACTIVE") nextAction = "NONE";
  else if (context.status === "SUSPENDED" || ["REVIEW_REQUIRED", "BLOCKED", "REJECTED"].includes(context.complianceStatus)) nextAction = "CONTACT_COORDINATOR";
  else if (context.status === "APPLIED" || context.status === "COMPLIANCE_REVIEW") nextAction = "WAIT_REVIEW";
  else if (!context.contractReady) nextAction = "WAIT_CONTRACT";
  return { items, nextAction, terminal } as const;
}

export function agentDate(value: string, locale: AgentCabinetLocale, long = false) { return new Intl.DateTimeFormat(locale === "ro" ? "ro-MD" : "ru-MD", { day: "2-digit", month: long ? "long" : "short", year: "numeric" }).format(new Date(value)); }
export function attributionStatus(status: AgentClientView["status"] | null | undefined, locale: AgentCabinetLocale) { const labels = locale === "ro" ? { ACTIVE: "Activă", EXPIRED: "Expirată", REASSIGNED: "Transferată", TERMINATED: "Încheiată" } : { ACTIVE: "Активно", EXPIRED: "Срок завершён", REASSIGNED: "Передано", TERMINATED: "Завершено" }; return status ? labels[status] : (locale === "ro" ? "Nu este atribuit" : "Не закреплён"); }
export function eventLabel(type: string | null | undefined, locale: AgentCabinetLocale) { if (!type) return locale === "ro" ? "Recomandare înregistrată" : "Рекомендация зарегистрирована"; const labels: Record<string, [string,string]> = { REFERRAL_CAPTURED: ["Рекомендация получена","Recomandare primită"], REFERRAL_STATUS_CHANGED: ["Статус рекомендации изменён","Statutul recomandării s-a schimbat"], ATTRIBUTION_CREATED: ["Клиент закреплён","Client atribuit"], ATTRIBUTION_EXTENDED: ["Период защиты продлён","Perioada de protecție a fost prelungită"], ATTRIBUTION_CONFLICT: ["Закрепление проверяется","Atribuirea este verificată"], ATTRIBUTION_REASSIGNED: ["Закрепление передано","Atribuirea a fost transferată"], ATTRIBUTION_TERMINATED: ["Закрепление завершено","Atribuirea s-a încheiat"] }; return labels[type]?.[locale === "ro" ? 1 : 0] ?? (locale === "ro" ? "Stare actualizată" : "Состояние обновлено"); }
export function referralNextAction(item: Pick<AgentReferralView, "status" | "attributionStatus">, locale: AgentCabinetLocale) { if (["CAPTURED","PENDING_REVIEW","CONFLICT"].includes(item.status)) return locale === "ro" ? "Așteptați verificarea Novotech" : "Ожидайте проверку Novotech"; if (item.attributionStatus === "ACTIVE") return locale === "ro" ? "Urmăriți evoluția clientului" : "Следите за движением клиента"; return locale === "ro" ? "Deschideți pentru detalii" : "Откройте подробности"; }
export function maskedContact(phone: string | null, email: string | null, locale: AgentCabinetLocale) { if (phone) return phone.replace(/(\+?\d{3})\d+(\d{2})$/, "$1•••••$2"); if (email) { const [name, domain] = email.split("@"); return `${name.slice(0,2)}•••@${domain ?? ""}`; } return locale === "ro" ? "Contact neindicat" : "Контакт не указан"; }
