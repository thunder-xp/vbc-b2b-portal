import {
  publishInstallationTariffAction,
  saveInstallationProviderAction,
  saveInstallationTariffDraftAction,
} from "@/src/modules/retail-marketplace/actions";
import { getRetailMarketplaceRepository } from "@/src/modules/retail-marketplace/server";
import { requireAdminPagePermission } from "@/src/modules/admin/services/admin-page-guard";

const lineLabels = {
  camera_installation: "Монтаж камеры",
  cable_laying: "Прокладка кабеля",
  commissioning: "Пусконаладка",
  remote_configuration: "Настройка удалённого просмотра",
} as const;

export default async function RetailInstallationAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPagePermission("admin.retail_marketplace.view");
  const [report, query] = await Promise.all([getRetailMarketplaceRepository().getAdminReport(), searchParams]);
  const draft = report.tariffSets.find((set) => set.status === "draft");
  const published = report.tariffSets.find((set) => set.status === "published");
  return <main className="space-y-8">
    <header><p className="text-sm font-semibold text-emerald-700">Retail Marketplace</p><h1 className="mt-1 text-2xl font-semibold">Монтаж: тарифы и исполнители</h1><p className="mt-2 max-w-3xl text-sm text-zinc-600">Тарифы Novotech и допуск исполнителей. Назначение заказов и выплаты в этот раздел не входят.</p></header>
    {query.saved ? <p className="border-l-4 border-emerald-600 bg-emerald-50 p-3 text-sm">Изменение сохранено.</p> : null}
    <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Тарифы CCTV</h2><p className="text-sm text-zinc-600">Опубликованная версия: {published ? `v${published.version}` : "нет"}</p></div></div>
      <form action={saveInstallationTariffDraftAction} className="grid gap-4 border border-zinc-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
        <input name="tariffSetId" type="hidden" value={draft?.id ?? ""} /><input name="revision" type="hidden" value={draft?.revision ?? 0} />
        {Object.entries(lineLabels).map(([key,label]) => <label className="grid gap-1 text-sm" key={key}><span className="font-medium">{label}, MDL</span><input className="min-h-11 border border-zinc-300 px-3" defaultValue={draft?.lines.find((line) => line.serviceType === key)?.unitPrice ?? ""} min="0" name={key} required step="0.01" type="number" /></label>)}
        <label className="grid gap-1 text-sm"><span className="font-medium">Действует с</span><input className="min-h-11 border border-zinc-300 px-3" defaultValue={dateTimeValue(draft?.effectiveFrom)} name="effectiveFrom" required type="datetime-local" /></label>
        <label className="grid gap-1 text-sm"><span className="font-medium">НДС</span><select className="min-h-11 border border-zinc-300 px-3" defaultValue={draft?.vatTreatment ?? "not_specified"} name="vatTreatment"><option value="included">Включён</option><option value="excluded">Не включён</option><option value="not_specified">Не указан</option></select></label>
        <label className="grid gap-1 text-sm md:col-span-2"><span className="font-medium">Причина изменения</span><input className="min-h-11 border border-zinc-300 px-3" minLength={5} name="reason" required /></label>
        <button className="min-h-11 bg-zinc-900 px-4 text-sm font-semibold text-white" type="submit">{draft ? "Сохранить черновик" : "Создать черновик"}</button>
      </form>
      {draft && draft.lines.length === 4 ? <form action={publishInstallationTariffAction} className="flex flex-wrap gap-3 border border-amber-200 bg-amber-50 p-4"><input name="tariffSetId" type="hidden" value={draft.id} /><input name="revision" type="hidden" value={draft.revision} /><input className="min-h-11 flex-1 border border-zinc-300 px-3" minLength={5} name="reason" placeholder="Причина публикации" required /><button className="min-h-11 bg-emerald-700 px-4 text-sm font-semibold text-white" type="submit">Опубликовать v{draft.version}</button></form> : null}
    </section>
    <section className="space-y-4"><div><h2 className="text-xl font-semibold">Исполнители</h2><p className="text-sm text-zinc-600">Публичность требует активного статуса, одобрения, участия, опубликованного профиля, CCTV и региона.</p></div>
      <details className="border border-zinc-200 bg-white p-4"><summary className="min-h-11 cursor-pointer font-semibold">Добавить партнёра-исполнителя</summary><form action={saveInstallationProviderAction} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <input name="providerId" type="hidden" value="" /><input name="revision" type="hidden" value="0" /><input name="providerType" type="hidden" value="partner_company" />
        <label className="grid gap-1 text-sm"><span className="font-medium">Партнёрская компания</span><select className="min-h-11 border border-zinc-300 px-3" name="backingId" required>{report.partnerCompanies.map((company)=><option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <Field defaultValue="" label="Публичное имя RU" name="publicNameRu" /><Field defaultValue="" label="Публичное имя RO" name="publicNameRo" />
        <input name="operationalStatus" type="hidden" value="inactive" /><input name="approvalStatus" type="hidden" value="pending" /><input name="publicProfileStatus" type="hidden" value="draft" /><input name="availability" type="hidden" value="unavailable" /><input name="acceptanceSlaMinutes" type="hidden" value="120" />
        <label className="flex min-h-11 items-center gap-2 text-sm"><input name="cctv" type="checkbox" /> Компетенция CCTV</label><fieldset className="md:col-span-2"><legend className="text-sm font-medium">Регионы</legend><div className="mt-2 flex flex-wrap gap-4">{report.regions.map((region)=><label className="flex min-h-11 items-center gap-2 text-sm" key={region.id}><input name="regions" type="checkbox" value={region.code} />{region.nameRu}</label>)}</div></fieldset>
        <label className="grid gap-1 text-sm md:col-span-2"><span className="font-medium">Причина создания</span><input className="min-h-11 border border-zinc-300 px-3" minLength={5} name="reason" required /></label><button className="min-h-11 bg-zinc-900 px-4 text-sm font-semibold text-white" type="submit">Создать черновик</button>
      </form></details>
      <div className="grid gap-4">{report.providers.map((provider) => <form action={saveInstallationProviderAction} className="grid gap-4 border border-zinc-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-4" key={provider.id}>
        <input name="providerId" type="hidden" value={provider.id} /><input name="providerType" type="hidden" value={provider.providerType} /><input name="backingId" type="hidden" value={(provider.providerType === "partner_company" ? report.partnerCompanies : report.internalTeams).find((entry) => entry.name === provider.backingName)?.id ?? ""} /><input name="revision" type="hidden" value={provider.revision} />
        <div className="md:col-span-2 xl:col-span-4"><h3 className="font-semibold">{provider.backingName}</h3><p className="text-xs text-zinc-500">{provider.providerType === "internal_team" ? "Команда Novotech" : "Партнёрская компания"}</p></div>
        <Field defaultValue={provider.publicNameRu} label="Публичное имя RU" name="publicNameRu" /><Field defaultValue={provider.publicNameRo} label="Публичное имя RO" name="publicNameRo" />
        <Select defaultValue={provider.operationalStatus} label="Рабочий статус" name="operationalStatus" options={["active","inactive","suspended"]} /><Select defaultValue={provider.approvalStatus} label="Одобрение" name="approvalStatus" options={["pending","approved","rejected"]} />
        <Select defaultValue={provider.publicProfileStatus} label="Публичный профиль" name="publicProfileStatus" options={["draft","published"]} /><Select defaultValue={provider.availability} label="Доступность" name="availability" options={["available","limited","unavailable"]} />
        <Field defaultValue={String(provider.acceptanceSlaMinutes)} label="SLA ответа, минут" name="acceptanceSlaMinutes" type="number" /><Field defaultValue={provider.maxConcurrentJobs?.toString() ?? ""} label="Одновременных работ" name="maxConcurrentJobs" type="number" />
        <label className="flex min-h-11 items-center gap-2 text-sm"><input defaultChecked={provider.marketplaceEnabled} name="marketplaceEnabled" type="checkbox" /> Участие включено</label><label className="flex min-h-11 items-center gap-2 text-sm"><input defaultChecked={provider.competencies.includes("cctv")} name="cctv" type="checkbox" /> Компетенция CCTV</label>
        <fieldset className="md:col-span-2"><legend className="text-sm font-medium">Регионы</legend><div className="mt-2 flex flex-wrap gap-4">{report.regions.map((region) => <label className="flex min-h-11 items-center gap-2 text-sm" key={region.id}><input defaultChecked={provider.regions.includes(region.code)} name="regions" type="checkbox" value={region.code} />{region.nameRu}</label>)}</div></fieldset>
        <label className="grid gap-1 text-sm md:col-span-2"><span className="font-medium">Причина изменения</span><input className="min-h-11 border border-zinc-300 px-3" minLength={5} name="reason" required /></label><button className="min-h-11 bg-zinc-900 px-4 text-sm font-semibold text-white" type="submit">Сохранить исполнителя</button>
      </form>)}</div>
    </section>
  </main>;
}

function Field({ defaultValue,label,name,type="text" }: { defaultValue:string;label:string;name:string;type?:string }) { return <label className="grid gap-1 text-sm"><span className="font-medium">{label}</span><input className="min-h-11 border border-zinc-300 px-3" defaultValue={defaultValue} name={name} required={name !== "maxConcurrentJobs"} type={type} /></label>; }
function Select({ defaultValue,label,name,options }: { defaultValue:string;label:string;name:string;options:string[] }) { return <label className="grid gap-1 text-sm"><span className="font-medium">{label}</span><select className="min-h-11 border border-zinc-300 px-3" defaultValue={defaultValue} name={name}>{options.map((option)=><option key={option}>{option}</option>)}</select></label>; }
function dateTimeValue(value?: string) { const date=value ? new Date(value) : new Date(); return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16); }
