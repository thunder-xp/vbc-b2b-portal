import type { AccessRiskState } from "../types";

const LABEL: Record<AccessRiskState, string> = {
  LEARNING: "Обучение", LOW: "Низкий", ELEVATED: "Повышенный", HIGH: "Высокий",
};
const STYLE: Record<AccessRiskState, string> = {
  LEARNING: "border-slate-200 bg-slate-50 text-slate-600",
  LOW: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ELEVATED: "border-amber-200 bg-amber-50 text-amber-800",
  HIGH: "border-red-200 bg-red-50 text-red-700",
};

export function AccessRiskBadge({ state }: { state: AccessRiskState }) {
  return <span className={`inline-flex min-h-7 items-center border px-2 text-xs font-semibold ${STYLE[state]}`}>{LABEL[state]}</span>;
}
