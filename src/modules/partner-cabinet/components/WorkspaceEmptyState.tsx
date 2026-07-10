export function WorkspaceEmptyState({
  actionLabel,
  message,
  title,
}: {
  actionLabel: string;
  message: string;
  title: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-4">
      <h3 className="text-sm font-medium text-zinc-950">{title}</h3>
      <p className="mt-1 text-sm text-zinc-600">{message}</p>
      <p className="mt-3 text-sm font-medium text-emerald-700">{actionLabel}</p>
    </div>
  );
}
