import { ProductComparisonView } from "@/src/modules/catalog/components/ProductComparisonView";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ category?: string | string[] }> }) {
  const categoryValue = (await searchParams).category;
  const categoryId = Array.isArray(categoryValue) ? categoryValue[0] : categoryValue;
  const workspace = await getPartnerWorkspaceContextAction();
  return <section><h1 className="text-2xl font-semibold text-zinc-950">Сравнение товаров</h1><p className="mt-2 text-sm text-zinc-600">Актуальные цены и наличие загружаются из локальной коммерческой витрины.</p>{workspace.success && workspace.data.companyId && categoryId ? <ProductComparisonView categoryId={categoryId} companyId={workspace.data.companyId} userId={workspace.data.userId} /> : <p className="py-10 text-sm text-zinc-600">Сравнение недоступно.</p>}</section>;
}
