export function WorkspaceMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
        {value}
      </dd>
    </div>
  );
}
