type StatusBadgeProps = {
  label: string;
  tone?: "green" | "amber" | "red" | "zinc";
};

const toneClassName: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  red: "border-red-200 bg-red-50 text-red-800",
  zinc: "border-zinc-200 bg-zinc-50 text-zinc-700",
};

export function StatusBadge({ label, tone = "zinc" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClassName[tone]}`}
    >
      {label}
    </span>
  );
}
