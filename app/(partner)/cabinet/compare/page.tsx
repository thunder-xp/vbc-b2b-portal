import { ProductComparisonView } from "@/src/modules/catalog/components/ProductComparisonView";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";
import { workspaceCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const [workspace, locale] = await Promise.all([getPartnerWorkspaceContextAction(), getPartnerLocale()]);
  const copy = workspaceCopy(locale);
  return (
    <section>
      <h1 className="text-2xl font-semibold text-zinc-950">{copy.compareTitle}</h1>
      <p className="mt-2 text-sm text-zinc-600">{copy.compareIntro}</p>
      <div className="mt-6">
        {workspace.success && workspace.data.companyId ? (
          <ProductComparisonView canAddToOrder={workspace.data.capabilities.productCard.canAddToOrder} canAddToSpecification={workspace.data.capabilities.productCard.canAddToSpecification} companyId={workspace.data.companyId} userId={workspace.data.userId} />
        ) : (
          <div className="border-y border-zinc-200 py-10"><h2 className="font-semibold text-zinc-950">{copy.compareUnavailable}</h2><p className="mt-2 text-sm text-zinc-600">{copy.compareUnavailableHint}</p></div>
        )}
      </div>
    </section>
  );
}
