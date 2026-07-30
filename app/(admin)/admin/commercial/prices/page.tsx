import { AdminCommercialPage } from "@/src/modules/admin";
import {
  RETAIL_HISTORY_ABSENCE_REASONS,
  type RetailHistoryAbsenceReason,
} from "@/src/modules/admin/types";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminPricesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const search = single(params.q);
  const categoryId = single(params.category);
  const reason = absenceReason(single(params.reason));
  const page = positivePage(single(params.page));

  return (
    <AdminCommercialPage
      domain="prices"
      retailHistoryAbsenceFilters={{
        search,
        categoryId,
        reason,
        page,
        pageSize: 25,
      }}
    />
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function positivePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function absenceReason(value: string | undefined): RetailHistoryAbsenceReason | undefined {
  return RETAIL_HISTORY_ABSENCE_REASONS.find((reason) => reason === value);
}
