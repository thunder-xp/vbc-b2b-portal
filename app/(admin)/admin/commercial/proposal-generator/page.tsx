import { getProposalGeneratorAdminReportAction } from "@/src/modules/estimates/actions";

const feedbackLabels = { yes: "Да", partial: "Частично", no: "Нет" } as const;

export default async function ProposalGeneratorAdminPage() {
  const result = await getProposalGeneratorAdminReportAction();
  if (!result.success) return <div className="space-y-3"><h1 className="text-2xl font-semibold">Генератор КП</h1><p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{result.message}</p></div>;
  const { summary, comments } = result.data;
  const metrics = [
    ["Запусков", summary.usageCount], ["Генераций завершено", summary.generationCompleted], ["Ошибок генерации", summary.generationFailed],
    ["Компаний", summary.companiesCount], ["Смет создано", summary.estimatesCreated], ["Конверсия в смету", `${summary.generatorToEstimateConversionRate}%`],
    ["Среднее время генерации", `${summary.averageGenerationDurationMs} мс`], ["От генерации до сметы", `${summary.averageGenerationToEstimateMs} мс`],
    ["Позиций в среднем", summary.averageGeneratedLines], ["Каталог", summary.resolvedCatalogCount], ["Своя номенклатура", summary.ownNomenclatureCount],
    ["Общая номенклатура", summary.sharedNomenclatureCount], ["Неуточнённых позиций", summary.unresolvedCount],
  ];
  return <div className="space-y-6"><header><p className="text-sm font-semibold text-emerald-700">Пилот</p><h1 className="mt-1 text-2xl font-semibold">Генератор КП</h1><p className="mt-1 text-sm text-zinc-600">Минимальные агрегированные показатели использования. Тексты требований и коммерческие данные здесь не сохраняются.</p></header>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(([label, value]) => <div className="rounded-md border border-zinc-200 bg-white p-4" key={label}><p className="text-sm text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}</section>
    <section className="rounded-md border border-zinc-200 bg-white p-4"><h2 className="font-semibold">Обратная связь</h2><div className="mt-3 flex flex-wrap gap-4 text-sm"><span>Да: <strong>{summary.feedbackYes}</strong></span><span>Частично: <strong>{summary.feedbackPartial}</strong></span><span>Нет: <strong>{summary.feedbackNo}</strong></span></div>
      <div className="mt-4 divide-y divide-zinc-100">{comments.length ? comments.map((comment, index) => <article className="py-3 text-sm" key={`${comment.created_at}-${index}`}><p className="font-medium">{feedbackLabels[comment.answer]}</p><p className="mt-1 text-zinc-700">{comment.comment}</p><time className="mt-1 block text-xs text-zinc-500">{new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(comment.created_at))}</time></article>) : <p className="py-3 text-sm text-zinc-500">Комментариев пока нет.</p>}</div>
    </section>
  </div>;
}
