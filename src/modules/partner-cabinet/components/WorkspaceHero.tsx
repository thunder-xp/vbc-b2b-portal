import type { WorkspaceHomeDto } from "../services";

export function WorkspaceHero({ workspace }: { workspace: WorkspaceHomeDto }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium uppercase tracking-[0.14em] text-emerald-700">Novotech Partner Workspace</p>
      <h1 className="mt-2 text-3xl font-semibold text-zinc-950">Добро пожаловать, {workspace.greetingName}</h1>
      <dl className="mt-6 grid gap-4 border-t border-zinc-200 pt-5 sm:grid-cols-2 xl:grid-cols-5">
        <InfoRow label="Компания" value={workspace.company.name} />
        <InfoRow label="Роль" value={workspace.company.role} />
        <InfoRow label="Код компании в 1С" value={workspace.company.external1cCode} />
        <InfoRow label="Статус партнёра" value={workspace.company.priceType} />
        {workspace.company.accountManager && <InfoRow label="Менеджер" value={workspace.company.accountManager} />}
      </dl>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-medium uppercase text-zinc-500">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-zinc-950">{value}</dd></div>;
}
