import type { WorkspaceHomeDto } from "../services";

export function WorkspaceHero({ workspace }: { workspace: WorkspaceHomeDto }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-emerald-700">
            My workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            Good morning, {workspace.greetingName}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
            Start with catalog, current commercial context, and today’s partner
            workspace activity.
          </p>
        </div>
        <dl className="grid gap-3 rounded-md bg-zinc-50 p-4 text-sm">
          <InfoRow label="Company" value={workspace.company.name} />
          <InfoRow label="Active company" value={workspace.company.status} />
          <InfoRow label="Current price type" value={workspace.company.priceType} />
          <InfoRow label="Manager" value={workspace.company.manager} />
        </dl>
      </div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-950">{value}</dd>
    </div>
  );
}
