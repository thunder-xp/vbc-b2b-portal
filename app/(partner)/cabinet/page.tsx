import { redirect } from "next/navigation";

import { getWorkspaceHomeAction } from "@/src/modules/partner-cabinet/actions/workspace-home.action";
import {
  QuickActions,
  WorkspaceEmptyState,
  WorkspaceHero,
  WorkspaceProcessGrid,
} from "@/src/modules/partner-cabinet/components";

export default async function CabinetPage() {
  const result = await getWorkspaceHomeAction();
  if (!result.success && result.errorCode === "AUTH_REQUIRED") redirect("/auth/sign-in");
  if (!result.success) {
    return <WorkspaceEmptyState actionLabel="Обновить страницу" message="Не удалось загрузить данные рабочего пространства. Попробуйте ещё раз позже." title="Данные временно недоступны" />;
  }

  const workspace = result.data;
  return (
    <div className="space-y-6">
      <WorkspaceHero workspace={workspace} />

      {workspace.commercialConfigurationMissing && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          Коммерческие условия компании ещё не настроены. Обратитесь к менеджеру Novotech.
        </section>
      )}

      <QuickActions actions={workspace.quickActions} />
      <WorkspaceProcessGrid cards={workspace.processCards} />
    </div>
  );
}
