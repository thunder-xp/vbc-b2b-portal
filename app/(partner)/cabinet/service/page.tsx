import Link from "next/link";

import { PartnerWorkspaceTabs } from "@/src/modules/partner-cabinet/components/PartnerWorkspaceTabs";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import {
  SERVICE_WORKSPACE_VIEWS,
  ServiceAnalyticsPanel,
  ServiceMonthlySummaryCard,
  UnifiedServiceHistoryList,
  formatDecimalMoney,
  getPartnerServiceWorkspaceViewAction,
  normalizeServiceWorkspaceView,
  type ServiceMonthlySummary,
  type UnifiedServiceHistoryPage,
} from "@/src/modules/service-history";
import { PartnerWarrantySerialLookup } from "@/src/modules/warranty-serials";

const workspaceCopy = {
  ru: {
    title: "Сервис и ремонт",
    subtitle: "Документы сервиса, текущие ремонты, стоимость услуг и история обслуживания.",
    create: "Создать заявку",
    tabs: { overview: "Обзор", active: "В ремонте", completed: "Завершённые", all: "Все документы", analytics: "Аналитика" },
    active: "В ремонте", completedMonth: "Завершено за месяц", monthlyValue: "Стоимость услуг за месяц", monthlyDocuments: "Документов за месяц",
    activeTitle: "Сейчас в ремонте", activeDescription: "Текущие сервисные документы с неоконченным статусом.",
    activeEmpty: "Сейчас у вас нет оборудования в ремонте.", activeEmptyHint: "Новые принятые документы появятся здесь автоматически.", allActive: "Все ремонты",
    completedTitle: "Недавно завершено", completedDescription: "Последние завершённые и выданные сервисные документы.",
    completedEmpty: "Завершённых ремонтов пока нет.", completedEmptyHint: "Завершённые сервисные документы появятся здесь автоматически.", allCompleted: "Все завершённые",
    allTitle: "Все сервисные документы", allDescription: "Полная история с поиском, фильтрами и постраничной навигацией.",
    analyticsTitle: "Аналитика сервиса", analyticsDescription: "Финансовая сводка, динамика и структура выполненных работ.",
    searchPlaceholder: "Номер, товар или серийный номер", filterLabel: "Фильтр документов", ready: "Готово к выдаче", all: "Все", search: "Найти",
    warranty: "Проверка покупки и гарантии", loadError: "Не удалось загрузить сервисный центр. Повторите попытку позже.",
  },
  ro: {
    title: "Service și reparații",
    subtitle: "Documente de service, reparații curente, costul serviciilor și istoricul întreținerii.",
    create: "Creează solicitare",
    tabs: { overview: "Prezentare generală", active: "În reparație", completed: "Finalizate", all: "Toate documentele", analytics: "Analiză" },
    active: "În reparație", completedMonth: "Finalizate în lună", monthlyValue: "Costul serviciilor în lună", monthlyDocuments: "Documente în lună",
    activeTitle: "Acum în reparație", activeDescription: "Documente de service curente cu statut nefinalizat.",
    activeEmpty: "Nu aveți echipamente în reparație acum.", activeEmptyHint: "Documentele noi acceptate vor apărea automat aici.", allActive: "Toate reparațiile",
    completedTitle: "Finalizate recent", completedDescription: "Ultimele documente de service finalizate și eliberate.",
    completedEmpty: "Nu există încă reparații finalizate.", completedEmptyHint: "Documentele de service finalizate vor apărea automat aici.", allCompleted: "Toate finalizate",
    allTitle: "Toate documentele de service", allDescription: "Istoricul complet cu căutare, filtre și paginare.",
    analyticsTitle: "Analiza service-ului", analyticsDescription: "Rezumat financiar, dinamică și structura lucrărilor efectuate.",
    searchPlaceholder: "Număr, produs sau număr de serie", filterLabel: "Filtru documente", ready: "Gata de ridicare", all: "Toate", search: "Caută",
    warranty: "Verificarea achiziției și garanției", loadError: "Centrul de service nu a putut fi încărcat. Încercați din nou mai târziu.",
  },
} as const;

type SearchParams = { view?: string; query?: string; filter?: string; page?: string; month?: string };

export default async function ServicePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, locale] = await Promise.all([searchParams, getPartnerLocale()]);
  const view = normalizeServiceWorkspaceView(params.view);
  const copy = workspaceCopy[locale];
  const result = await getPartnerServiceWorkspaceViewAction({ ...params, view });
  const tabs = SERVICE_WORKSPACE_VIEWS.map((key) => ({ key, label: copy.tabs[key], href: `/cabinet/service?view=${key}` }));

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="text-2xl font-semibold">{copy.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{copy.subtitle}</p></div>
        <Link className="inline-flex min-h-11 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" href="/cabinet/service/new">{copy.create}</Link>
      </header>
      <PartnerWorkspaceTabs activeKey={view} ariaLabel={copy.title} tabs={tabs} />
      {!result.success ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{copy.loadError}</p>
      ) : result.data.view === "overview" ? (
        <Overview active={result.data.activePreview} completed={result.data.completedPreview} locale={locale} monthlyDocumentCount={result.data.monthlyDocumentCount} summary={result.data.monthlySummary} />
      ) : result.data.view === "analytics" ? (
        <section aria-labelledby="service-analytics-workspace-title" className="space-y-5">
          <SectionHeading description={copy.analyticsDescription} id="service-analytics-workspace-title" title={copy.analyticsTitle} />
          <ServiceMonthlySummaryCard locale={locale} summary={result.data.monthlySummary} view="analytics" />
          <ServiceAnalyticsPanel analytics={result.data.analytics} locale={locale} />
        </section>
      ) : (
        <HistorySection filter={params.filter} locale={locale} page={result.data.history} query={params.query} view={result.data.view} />
      )}
    </main>
  );
}

function Overview({ active, completed, locale, monthlyDocumentCount, summary }: { active: UnifiedServiceHistoryPage; completed: UnifiedServiceHistoryPage; locale: "ru" | "ro"; monthlyDocumentCount: number; summary: ServiceMonthlySummary }) {
  const copy = workspaceCopy[locale];
  const values = summary.currencies.map((bucket) => formatDecimalMoney(bucket.totalServiceAmount, bucket.currency));
  return (
    <div className="space-y-6">
      <section aria-label={copy.tabs.overview} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={copy.active} value={String(active.total)} />
        <Kpi label={copy.completedMonth} value={String(monthlyDocumentCount)} />
        <Kpi label={copy.monthlyValue} values={values.length ? values : ["—"]} />
        <Kpi label={copy.monthlyDocuments} value={String(monthlyDocumentCount)} />
      </section>
      <ServiceMonthlySummaryCard locale={locale} summary={summary} view="overview" />
      <PreviewSection description={copy.activeDescription} emptyHint={copy.activeEmptyHint} emptyTitle={copy.activeEmpty} href="/cabinet/service?view=active" linkLabel={copy.allActive} locale={locale} page={active} title={copy.activeTitle} />
      <PreviewSection description={copy.completedDescription} emptyHint={copy.completedEmptyHint} emptyTitle={copy.completedEmpty} href="/cabinet/service?view=completed" linkLabel={copy.allCompleted} locale={locale} page={completed} title={copy.completedTitle} />
      <section aria-labelledby="warranty-check-title"><h2 className="mb-3 text-lg font-semibold" id="warranty-check-title">{copy.warranty}</h2><PartnerWarrantySerialLookup /></section>
    </div>
  );
}

function HistorySection({ filter, locale, page, query, view }: { filter?: string; locale: "ru" | "ro"; page: UnifiedServiceHistoryPage; query?: string; view: "active" | "completed" | "all" }) {
  const copy = workspaceCopy[locale];
  const title = view === "active" ? copy.activeTitle : view === "completed" ? copy.tabs.completed : copy.allTitle;
  const description = view === "active" ? copy.activeDescription : view === "completed" ? copy.completedDescription : copy.allDescription;
  const emptyTitle = view === "active" ? copy.activeEmpty : view === "completed" ? copy.completedEmpty : copy.allTitle;
  const emptyHint = view === "active" ? copy.activeEmptyHint : view === "completed" ? copy.completedEmptyHint : copy.allDescription;
  const effectiveFilter = view === "all" ? filter ?? "all" : view;
  return (
    <section aria-labelledby="service-history-title" className="space-y-4">
      <SectionHeading description={description} id="service-history-title" title={title} />
      <form className={`grid gap-2 ${view === "all" ? "sm:grid-cols-[minmax(0,1fr)_220px_auto]" : "sm:grid-cols-[minmax(0,1fr)_auto]"}`}>
        <input name="view" type="hidden" value={view} />
        {view !== "all" ? <input name="filter" type="hidden" value={view} /> : null}
        <input className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm" defaultValue={query} name="query" placeholder={copy.searchPlaceholder} />
        {view === "all" ? <select aria-label={copy.filterLabel} className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm" defaultValue={effectiveFilter} name="filter"><option value="active">{copy.tabs.active}</option><option value="ready">{copy.ready}</option><option value="completed">{copy.tabs.completed}</option><option value="all">{copy.all}</option></select> : null}
        <button className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold">{copy.search}</button>
      </form>
      <UnifiedServiceHistoryList emptyHint={emptyHint} emptyTitle={emptyTitle} filter={effectiveFilter} locale={locale} page={page} query={query} view={view} />
    </section>
  );
}

function PreviewSection({ description, emptyHint, emptyTitle, href, linkLabel, locale, page, title }: { description: string; emptyHint: string; emptyTitle: string; href: string; linkLabel: string; locale: "ru" | "ro"; page: UnifiedServiceHistoryPage; title: string }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3"><SectionHeading description={description} title={title} /><Link className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700" href={href}>{linkLabel} →</Link></div>
      <UnifiedServiceHistoryList emptyHint={emptyHint} emptyTitle={emptyTitle} locale={locale} page={page} paginated={false} view="overview" />
    </section>
  );
}

function SectionHeading({ description, id, title }: { description: string; id?: string; title: string }) { return <div><h2 className="text-xl font-semibold" id={id}>{title}</h2><p className="mt-1 text-sm text-zinc-600">{description}</p></div>; }

function Kpi({ label, value, values }: { label: string; value?: string; values?: string[] }) {
  return <article className="border border-zinc-200 bg-white p-4">{value ? <p className="text-2xl font-semibold tabular-nums">{value}</p> : values?.map((item) => <p className="text-lg font-semibold tabular-nums" key={item}>{item}</p>)}<p className="mt-1 text-xs text-zinc-600">{label}</p></article>;
}
