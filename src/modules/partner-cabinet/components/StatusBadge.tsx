import { StatusBadge as CanonicalStatusBadge } from "../../platform-ui";
import type { StatusCategory, StatusDescriptor } from "../../platform-ui";

type StatusBadgeProps = {
  label: string;
  tone?: "green" | "amber" | "red" | "zinc";
};

const categoryByTone: Record<NonNullable<StatusBadgeProps["tone"]>, StatusCategory> = {
  green: "success",
  amber: "warning",
  red: "danger",
  zinc: "neutral",
};

export function StatusBadge({ label, tone = "zinc" }: StatusBadgeProps) {
  const status: StatusDescriptor = {
    label, category: categoryByTone[tone], icon: tone === "green" ? "check" : tone === "amber" ? "clock" : tone === "red" ? "alert" : "minus",
    accessibleText: `Статус: ${label}`, domains: ["partner-cabinet"],
  };
  return <CanonicalStatusBadge status={status} />;
}
