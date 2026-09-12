import Link from "next/link";

import { AdminPageHeader, requireAdminPagePermission } from "@/src/modules/admin";
import { createAccessRiskService } from "@/src/modules/access-risk";
import { AccessRiskCompanyView } from "@/src/modules/access-risk/components";

export default async function AdminAccessRiskCompanyPage({ params }: { params: Promise<{ companyId: string }> }) {
  const workspace = await requireAdminPagePermission("admin.security.view");
  const { companyId } = await params;
  const data = await createAccessRiskService().getCompany(companyId);
  return <div className="space-y-6"><div><Link className="text-sm font-semibold text-zinc-600 hover:text-zinc-950" href="/admin/security/access-risk">← Мониторинг рисков</Link></div><AdminPageHeader eyebrow="Безопасность" title={data.company.name} description="Снимок риска, пользовательские причины и ограниченная история расширенного мониторинга."/><AccessRiskCompanyView data={data} canManage={workspace.permissions.includes("admin.security.manage")}/></div>;
}
