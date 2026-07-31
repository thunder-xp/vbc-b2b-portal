import {
  listOnboardingQueueAction,
  synchronizeCounterpartyDirectoryFormAction,
} from "@/src/modules/onboarding/actions";
import Link from "next/link";
import { OnboardingQueueView } from "@/src/modules/onboarding/components";
import type { OnboardingQueueInput } from "@/src/modules/onboarding/repositories";
import { requireAdminPagePermission } from "@/src/modules/admin";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminOnboardingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const context = await requireAdminPagePermission("onboarding.requests.view");
  const filters = parseFilters(await searchParams);
  const result = await listOnboardingQueueAction(filters);

  return (
    <div className="bg-zinc-50 text-zinc-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
          <p className="text-sm font-semibold uppercase text-emerald-700">
            Подключение партнёров
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Очередь онбординга</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Проверка заявок, назначение ответственных и сопоставление с локальным
            справочником контрагентов 1С.
          </p>
          </div>
          <Link
            href="/admin/onboarding/health"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold hover:bg-zinc-50"
          >
            Состояние
          </Link>
        </header>

        {result.success ? (
          <OnboardingQueueView
            queue={result.data}
            filters={filters}
            canSynchronize={context.permissions.includes("admin.integrations.manage")}
            syncAction={synchronizeCounterpartyDirectoryFormAction}
          />
        ) : (
          <section className="border-y border-zinc-200 bg-white py-8">
            <h2 className="font-semibold">Очередь временно недоступна</h2>
            <p className="mt-2 text-sm text-zinc-600">{result.message}</p>
          </section>
        )}
      </div>
    </div>
  );
}

function parseFilters(
  params: Record<string, string | string[] | undefined>,
): OnboardingQueueInput {
  return {
    page: boundedInteger(first(params.page), 1, 100_000, 1),
    pageSize: boundedInteger(first(params.pageSize), 1, 50, 25),
    status: clean(first(params.status)),
    assignedManager: clean(first(params.manager)),
    unassigned: first(params.unassigned) === "1",
    sla: clean(first(params.sla)),
    matchState: clean(first(params.match)),
    search: clean(first(params.q)),
    locality: clean(first(params.locality)),
    businessType: clean(first(params.businessType)),
    submittedFrom: dateValue(first(params.from)),
    submittedTo: dateValue(first(params.to)),
  };
}

function dateValue(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function clean(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 200) : null;
}

function boundedInteger(
  value: string | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
