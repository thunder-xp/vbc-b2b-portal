import { notFound } from "next/navigation";

import { listCatalogProductsAction } from "@/src/modules/catalog/actions";
import { getProjectSpecificationAction } from "@/src/modules/project-specifications/actions";
import {
  AddSpecificationItemButton,
  SpecificationDetail,
} from "@/src/modules/project-specifications/components";
import { ProjectSpecificationStatus } from "@/src/modules/project-specifications/types";
import { getReservationEntryAction } from "@/src/modules/reservation-requests/actions";
import { ReservationEntry } from "@/src/modules/reservation-requests/components";
import { projectCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function ProjectSpecificationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ productSearch?: string }>;
}) {
  const [{ id }, queryParams, locale] = await Promise.all([
    params,
    searchParams,
    getPartnerLocale(),
  ]);
  const copy = projectCopy(locale);
  const query = queryParams?.productSearch?.trim() ?? "";
  const result = await getProjectSpecificationAction(id);
  if (!result.success) {
    if (result.errorCode === "NOT_FOUND") notFound();
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {copy.loadError}
      </p>
    );
  }
  const isDraft = result.data.status === ProjectSpecificationStatus.Draft;
  const productsResult = isDraft
    ? await listCatalogProductsAction({
        search: query || undefined,
        page: 1,
        pageSize: 8,
      })
    : null;
  const reservationEntry =
    result.data.status === ProjectSpecificationStatus.Approved
      ? await getReservationEntryAction(id)
      : null;

  if (!isDraft) {
    return (
      <div className="space-y-8">
        <SpecificationDetail locale={locale} specification={result.data} />
        {reservationEntry?.success ? (
          <ReservationEntry entry={reservationEntry.data} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SpecificationDetail locale={locale} specification={result.data} />
      {isDraft && (
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex flex-col gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-semibold">{copy.addEquipment}</h2>
              <p className="mt-1 text-sm text-zinc-500">
                {copy.productSearchHint}
              </p>
            </div>
            <form className="flex gap-2">
              <input
                className="h-10 w-full rounded-md border border-zinc-300 px-3 sm:w-72"
                defaultValue={query}
                name="productSearch"
                placeholder={copy.modelOrSku}
              />
              <button
                className="rounded-md border border-zinc-300 px-3 text-sm font-semibold"
                type="submit"
              >
                {copy.search}
              </button>
            </form>
          </div>
          {productsResult?.success && productsResult.data.products.length ? (
            <div className="divide-y divide-zinc-100">
              {productsResult.data.products.map((product) => (
                <div
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  key={product.id}
                >
                  <div>
                    <p className="font-semibold">{product.name}</p>
                    <p className="text-xs text-zinc-500">SKU {product.sku}</p>
                  </div>
                  <AddSpecificationItemButton
                    productId={product.id}
                    specificationId={id}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-zinc-500">
              {copy.productsNotFound}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
