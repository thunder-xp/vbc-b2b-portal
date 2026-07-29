import { ProductComparisonView } from "@/src/modules/catalog/components/ProductComparisonView";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const workspace = await getPartnerWorkspaceContextAction();

  return (
    <section>
      <h1 className="text-2xl font-semibold text-zinc-950">Сравнение товаров</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Сравнивайте актуальные цены, наличие и характеристики товаров.
      </p>
      <div className="mt-6">
        {workspace.success && workspace.data.companyId ? (
          <ProductComparisonView
            canAddToOrder={workspace.data.capabilities.productCard.canAddToOrder}
            canAddToSpecification={
              workspace.data.capabilities.productCard.canAddToSpecification
            }
            companyId={workspace.data.companyId}
            userId={workspace.data.userId}
          />
        ) : (
          <div className="border-y border-zinc-200 py-10">
            <h2 className="font-semibold text-zinc-950">
              Сравнение временно недоступно
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Не удалось подтвердить активную компанию. Обновите страницу или
              выберите компанию повторно.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
