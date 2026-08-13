import { getProposalGeneratorAdminReportAction, listCctvCameraPoolsAction, listCctvObjectConfigurationsAction, listProposalGeneratorProfilesAction } from "@/src/modules/estimates/actions";
import { AdminCctvCameraPools, AdminProposalGeneratorProfiles } from "@/src/modules/estimates/components";

const feedbackLabels = { yes: "Да", partial: "Частично", no: "Нет" } as const;
const objectLabels: Record<string, string> = { apartment: "Квартира", house: "Частный дом", office: "Офис", retail: "Магазин / Retail", warehouse: "Склад", industrial: "Промышленный объект", horeca: "HoReCa", other: "Другое" };

export default async function ProposalGeneratorAdminPage() {
  const [reportResult, profilesResult, poolsResult, configurationsResult] = await Promise.all([getProposalGeneratorAdminReportAction(), listProposalGeneratorProfilesAction(), listCctvCameraPoolsAction(), listCctvObjectConfigurationsAction()]);
  if (!reportResult.success) return <div className="space-y-3"><h1 className="text-2xl font-semibold">Генератор КП</h1><p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{reportResult.message}</p></div>;
  const { summary, comments, quickCalculationByObjectType } = reportResult.data;
  const metrics = [
    ["Запусков", summary.usageCount], ["Генераций завершено", summary.generationCompleted], ["Ошибок генерации", summary.generationFailed],
    ["Компаний", summary.companiesCount], ["Смет создано", summary.estimatesCreated], ["Конверсия в смету", `${summary.generatorToEstimateConversionRate}%`],
    ["Среднее время генерации", `${summary.averageGenerationDurationMs} мс`], ["От генерации до сметы", `${summary.averageGenerationToEstimateMs} мс`],
    ["Позиций в среднем", summary.averageGeneratedLines], ["Каталог", summary.resolvedCatalogCount], ["Услуги", summary.resolvedServiceCount], ["Своя номенклатура", summary.ownNomenclatureCount],
    ["Общая номенклатура", summary.sharedNomenclatureCount], ["Неуточнённых позиций", summary.unresolvedCount],
  ];
  return <div className="space-y-6"><header><p className="text-sm font-semibold text-emerald-700">Пилот</p><h1 className="mt-1 text-2xl font-semibold">Генератор КП</h1><p className="mt-1 text-sm text-zinc-600">Агрегированные показатели использования. Тексты требований и коммерческие данные здесь не сохраняются.</p></header>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(([label, value]) => <div className="rounded-md border border-zinc-200 bg-white p-4" key={label}><p className="text-sm text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}</section>
    <section className="rounded-md border border-zinc-200 bg-white p-4"><h2 className="font-semibold">По способу</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">
      <ModeMetric label="По описанию" starts={summary.descriptionStarts} estimates={summary.descriptionEstimatesCreated} />
      <ModeMetric label="Быстрый расчёт" starts={summary.quickCalculationStarts} estimates={summary.quickCalculationEstimatesCreated} />
    </div><div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3"><span>Завершено расчётов: <strong>{summary.quickCalculationCompleted}</strong></span><span>Неуточнённых требований: <strong>{summary.quickCalculationUnresolvedCount}</strong></span><span>До сметы: <strong>{summary.averageQuickCalculationToEstimateMs} мс</strong></span></div>
      <div className="mt-4 grid gap-2 border-t border-zinc-200 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-3"><span>Регистратор изменён вручную: <strong>{summary.nvrManualOverrideCount}</strong></span><span>Регистратор удалён: <strong>{summary.nvrRemovedCount}</strong></span><span>Автопозиции заменены: <strong>{summary.autoProductReplacementCount}</strong></span><span>PoE заменён: <strong>{summary.poeReplacementCount}</strong></span><span>PoE удалён: <strong>{summary.poeRemovedCount}</strong></span><span>Ёмкость HDD скорректирована: <strong>{summary.hddCapacityCorrectionCount}</strong></span><span>Совместимая конфигурация: <strong>{summary.compatibleConfigurationCount}</strong></span><span>Несовместимость архива: <strong>{summary.storageIncompatibilityCount}</strong></span><span>Недостаточно PoE: <strong>{summary.insufficientPoeWarningCount}</strong></span></div>
      {quickCalculationByObjectType.length > 0 && <div className="mt-4"><h3 className="text-sm font-semibold">Объекты CCTV</h3><div className="mt-2 flex flex-wrap gap-2">{quickCalculationByObjectType.map((item) => <span className="rounded border border-zinc-200 px-2 py-1 text-xs" key={item.objectType}>{objectLabels[item.objectType] ?? item.objectType}: {item.starts} / {item.estimatesCreated}</span>)}</div></div>}
    </section>
    {poolsResult.success && configurationsResult.success ? <AdminCctvCameraPools initialConfigurations={configurationsResult.data} initialRows={poolsResult.data} /> : <p className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm">{poolsResult.success ? configurationsResult.message : poolsResult.message}</p>}
    <details className="rounded-md border border-zinc-200 bg-white p-4"><summary className="cursor-pointer font-semibold">Расширенные соответствия оборудования</summary><div className="mt-4">{profilesResult.success ? <AdminProposalGeneratorProfiles initialProfiles={profilesResult.data} /> : <p className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm">{profilesResult.message}</p>}</div></details>
    <section className="rounded-md border border-zinc-200 bg-white p-4"><h2 className="font-semibold">Обратная связь</h2><div className="mt-3 flex flex-wrap gap-4 text-sm"><span>Да: <strong>{summary.feedbackYes}</strong></span><span>Частично: <strong>{summary.feedbackPartial}</strong></span><span>Нет: <strong>{summary.feedbackNo}</strong></span></div><div className="mt-4 divide-y divide-zinc-100">{comments.length ? comments.map((comment, index) => <article className="py-3 text-sm" key={`${comment.created_at}-${index}`}><p className="font-medium">{feedbackLabels[comment.answer]}</p><p className="mt-1 text-zinc-700">{comment.comment}</p><time className="mt-1 block text-xs text-zinc-500">{new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(comment.created_at))}</time></article>) : <p className="py-3 text-sm text-zinc-500">Комментариев пока нет.</p>}</div></section>
  </div>;
}

function ModeMetric({ label, starts, estimates }: { label: string; starts: number; estimates: number }) {
  return <div className="rounded-md border border-zinc-200 p-3"><p className="font-semibold">{label}</p><p className="mt-2 text-sm text-zinc-600">Запусков: <strong>{starts}</strong> · Смет: <strong>{estimates}</strong></p></div>;
}
