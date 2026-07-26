export function AdminPageHeader({
  description,
  eyebrow,
  title,
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="border-b border-zinc-200 pb-5">
      <p className="text-xs font-semibold uppercase text-emerald-700">{eyebrow}</p>
      <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-zinc-600">{description}</p>
    </header>
  );
}
