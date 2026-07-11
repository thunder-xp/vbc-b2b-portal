import type { WorkspaceHomeDto } from "../services";
import { WorkspaceMetric } from "./WorkspaceMetric";

export function WorkspaceOperationalSummary({ operational }: { operational: WorkspaceHomeDto["operational"] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">Операционная сводка</h2>
      <p className="mt-1 text-sm text-zinc-600">Только данные, доступные в Partner Workspace.</p>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <WorkspaceMetric label="Активные заказы" value={operational.activeOrders} />
        <WorkspaceMetric label="Открытые проекты" value={operational.openProjects} />
        <WorkspaceMetric label="Документы, требующие внимания" value={operational.documentsRequiringAttention} />
        <WorkspaceMetric label="Обращения в поддержку" value={operational.supportRequests} />
      </dl>
    </section>
  );
}
