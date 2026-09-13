import { notFound } from "next/navigation";

import {
  AdminOperationalIssueDetail,
  createAdminOperationsService,
  requireAnyAdminPagePermission,
} from "@/src/modules/admin";

export default async function AdminOperationalIssuePage({
  params,
}: {
  params: Promise<{ issueId: string }>;
}) {
  const context = await requireAnyAdminPagePermission(["admin.dashboard.view", "admin.integrations.view"]);
  const { issueId } = await params;
  const issue = await createAdminOperationsService().getOperationalIssue(issueId);
  if (!issue) notFound();

  return (
    <AdminOperationalIssueDetail
      canManage={context.permissions.includes("admin.integrations.manage")}
      issue={issue}
    />
  );
}
