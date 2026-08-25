import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminPageHeader } from "@/src/modules/admin/components";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { AdminCompetitorRetailImportReview } from "@/src/modules/competitive-intelligence/components/AdminCompetitorRetailImportReview";
import { CompetitorRetailPricingRepository } from "@/src/modules/competitive-intelligence/retail-pricing.repository";

export default async function CompetitorRetailPriceImportPage({ params, searchParams }: { params: Promise<{ importId: string }>; searchParams?: Promise<{ notice?: string }> }) {
  const [context, { importId }, query] = await Promise.all([requireAdminPagePermission("admin.analytics.view"), params, searchParams]);
  const detail = await new CompetitorRetailPricingRepository().getImport(importId);
  if (!detail) notFound();
  return <main className="space-y-6"><Link className="text-sm font-semibold text-emerald-800" href="/admin/market-intelligence/price-lists">← Прайс-листы конкурентов</Link><AdminPageHeader eyebrow={detail.status} title={`${detail.competitorName} · ${detail.effectiveDate}`} description={`${detail.fileName} · ${detail.currency} · correlation ${detail.correlationId}`} /><AdminCompetitorRetailImportReview canManage={context.permissions.includes("admin.market_intelligence.manage")} detail={detail} notice={query?.notice} /></main>;
}
