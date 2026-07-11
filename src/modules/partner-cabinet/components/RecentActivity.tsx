import type { WorkspaceActivityDto } from "../services";

export function RecentActivity({
  activity,
}: {
  activity: WorkspaceActivityDto[];
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">Recent activity</h2>
      <div className="mt-4 grid gap-3">
        {activity.length === 0 && (
          <p className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
            Недавних действий пока нет.
          </p>
        )}
        {activity.map((item) => (
          <article
            className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3"
            key={item.id}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-zinc-950">
                  {item.label}
                </h3>
                <p className="mt-1 text-sm text-zinc-600">
                  {item.description}
                </p>
              </div>
              <time className="shrink-0 text-xs text-zinc-500">
                {formatActivityDate(item.occurredAt)}
              </time>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatActivityDate(value: string): string {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return "Today";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}
