import type { PartnerWorkspaceAccessState } from "../services";

const states = {
  suspended: ["Доступ приостановлен", "Обратитесь к менеджеру Novotech для восстановления доступа."],
  missing_membership: ["Нет доступа к компании", "Активное участие в компании не найдено. Обратитесь к менеджеру Novotech."],
  missing_company: ["Компания недоступна", "Компания не найдена или неактивна. Обратитесь к менеджеру Novotech."],
  unavailable: ["Рабочее пространство недоступно", "Не удалось безопасно определить доступ. Повторите попытку позже."],
} as const;

export function WorkspaceAccessState({ state }: { state: Extract<PartnerWorkspaceAccessState, "suspended" | "missing_membership" | "missing_company"> | "unavailable" }) {
  const [title, message] = states[state];
  return <section className="mx-auto max-w-2xl rounded-lg border border-amber-200 bg-white p-6 shadow-sm"><h1 className="text-xl font-semibold text-zinc-950">{title}</h1><p className="mt-3 text-sm leading-6 text-zinc-600">{message}</p></section>;
}
