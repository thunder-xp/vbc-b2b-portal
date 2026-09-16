import { redirect } from "next/navigation";

import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions/workspace-context.action";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import { getInstallationAssignmentDispatcher } from "@/src/modules/retail-marketplace/server";
import type { InstallationAssignmentView } from "@/src/modules/retail-marketplace/types";
import {
  optInInstallationMarketplaceAction,
  saveInstallationMarketplaceActivationAction,
  submitInstallationMarketplaceActivationAction,
} from "@/src/modules/installation-marketplace/actions";
import { getInstallationMarketplaceService } from "@/src/modules/installation-marketplace/server";
import { INSTALLATION_PARTNER_CAPABILITIES } from "@/src/modules/installation-marketplace/types";
import type { InstallationPartnerActivation, InstallationPartnerCapability } from "@/src/modules/installation-marketplace/types";
import { PartnerInstallationLists } from "@/src/modules/installation-marketplace/partner-installation-lists";

type WorkspaceView = "overview" | "new" | "active" | "completed" | "profile";

const workspaceCopy = {
  ru: {
    title: "Монтаж и заявки",
    intro: "Заявки клиентов, активные монтажи и профиль исполнителя в одном рабочем разделе.",
    tabs: { overview: "Обзор", new: "Новые заявки", active: "Активные монтажи", completed: "Завершённые", profile: "Профиль исполнителя" },
    primary: "Настроить профиль исполнителя",
  },
  ro: {
    title: "Montaj și solicitări",
    intro: "Solicitările clienților, instalările active și profilul executantului într-un singur spațiu de lucru.",
    tabs: { overview: "Prezentare", new: "Solicitări noi", active: "Instalări active", completed: "Finalizate", profile: "Profil instalator" },
    primary: "Configurează profilul instalatorului",
  },
} as const;

const workspaceViews: WorkspaceView[] = ["overview", "new", "active", "completed", "profile"];

const copy = {
  ru: {
    eyebrow: "Монтаж и заявки", title: "Стать партнёром по монтажу",
    intro: "Укажите реальные компетенции, территорию работы и доступность. После проверки Novotech профиль сможет участвовать в подборе исполнителей.",
    optIn: "Подключиться к заявкам на монтаж", status: "Статус", saved: "Данные сохранены.", enrolled: "Черновик участия создан.", submitted: "Заявка отправлена на проверку.",
    metrics: ["Новые заявки", "Активные монтажи", "Завершённые работы", "Проверенные отзывы"],
    checklist: "Готовность", profile: "Публичный профиль", service: "Услуга монтажа", capabilities: "Компетенции", area: "Территория", contact: "Контактное лицо", response: "Канал ответа", terms: "Условия участия", privacy: "Правила работы с данными клиента", admin: "Проверка Novotech", availability: "Доступность",
    ready: "Готово", missing: "Требуется", details: "Профиль исполнителя", descriptionRu: "Описание на русском", descriptionRo: "Descriere în română", capacity: "Одновременных работ", regions: "Регионы обслуживания", save: "Сохранить изменения", submit: "Отправить на проверку", termsAccept: "Принимаю условия участия в сети монтажников", privacyAccept: "Подтверждаю правила конфиденциальности и использование данных клиента только для выполнения принятой заявки", selfDeclared: "Заявлено партнёром", verified: "Проверено Novotech", locked: "Заявка находится на проверке. Изменения временно недоступны.", rejected: "Требуются исправления", suspend: "Участие приостановлено. Новые заявки не направляются.",
    available: "Доступен", limited: "Ограниченная загрузка", unavailable: "Недоступен",
  },
  ro: {
    eyebrow: "Montaj și solicitări", title: "Deveniți partener de instalare",
    intro: "Indicați competențele reale, zona de lucru și disponibilitatea. După verificarea Novotech, profilul poate participa la selectarea instalatorilor.",
    optIn: "Conectează-te la cererile de instalare", status: "Statut", saved: "Datele au fost salvate.", enrolled: "Ciorna participării a fost creată.", submitted: "Cererea a fost trimisă spre verificare.",
    metrics: ["Solicitări noi", "Instalări active", "Lucrări finalizate", "Recenzii verificate"],
    checklist: "Pregătire", profile: "Profil public", service: "Serviciu de instalare", capabilities: "Competențe", area: "Zonă de deservire", contact: "Persoană de contact", response: "Canal de răspuns", terms: "Condiții de participare", privacy: "Reguli privind datele clientului", admin: "Verificare Novotech", availability: "Disponibilitate",
    ready: "Pregătit", missing: "Necesar", details: "Profilul instalatorului", descriptionRu: "Descriere în rusă", descriptionRo: "Descriere în română", capacity: "Lucrări simultane", regions: "Zone de deservire", save: "Salvează modificările", submit: "Trimite spre verificare", termsAccept: "Accept condițiile de participare în rețeaua de instalatori", privacyAccept: "Confirm regulile de confidențialitate și folosirea datelor clientului numai pentru executarea solicitării acceptate", selfDeclared: "Declarat de partener", verified: "Verificat de Novotech", locked: "Cererea este în curs de verificare. Modificările sunt temporar indisponibile.", rejected: "Sunt necesare corectări", suspend: "Participarea este suspendată. Solicitările noi nu sunt trimise.",
    available: "Disponibil", limited: "Disponibilitate limitată", unavailable: "Indisponibil",
  },
} as const;

const capabilityLabels: Record<"ru" | "ro", Record<InstallationPartnerCapability, string>> = {
  ru: { cctv: "Видеонаблюдение", intercom: "Домофония", access_control: "Контроль доступа", alarm: "Сигнализация", network: "Сети / Wi-Fi", other: "Другие монтажные системы" },
  ro: { cctv: "Supraveghere video", intercom: "Interfonie", access_control: "Control acces", alarm: "Alarmă", network: "Rețele / Wi-Fi", other: "Alte sisteme de instalare" },
};
const readinessLabels = { PUBLIC_PROFILE: "profile", INSTALLATION_SERVICES: "service", CAPABILITIES: "capabilities", SERVICE_AREA: "area", CONTACT_PERSON: "contact", RESPONSE_CHANNEL: "response", MARKETPLACE_TERMS: "terms", CUSTOMER_PRIVACY: "privacy", ADMIN_VERIFICATION: "admin", AVAILABILITY: "availability" } as const;

export default async function InstallationMarketplaceActivationPage({ searchParams }: { searchParams: Promise<{ result?: string; view?: string }> }) {
  const [context, locale, query] = await Promise.all([getPartnerWorkspaceContextAction(), getPartnerLocale(), searchParams]);
  if (!context.success || !context.data.companyId || context.data.accessState !== "active") redirect("/cabinet");
  const state = await getInstallationMarketplaceService().getPartnerActivation(context.data.companyId, locale);
  const t = copy[locale];
  const workspace = workspaceCopy[locale];
  const view = workspaceViews.includes(query.view as WorkspaceView) ? query.view as WorkspaceView : "overview";
  const assignmentView: InstallationAssignmentView | null = view === "new" ? "offers" : view === "active" || view === "completed" ? view : null;
  const [assignments, marketplaceProjects] = assignmentView ? await Promise.all([
    getInstallationAssignmentDispatcher().list(context.data.companyId, assignmentView),
    getInstallationMarketplaceService().listPartner(context.data.companyId, view as "new" | "active" | "completed", locale),
  ]) : [[], []];
  return <main className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">{workspace.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{workspace.intro}</p></div><span className="rounded-full bg-zinc-100 px-3 py-2 text-xs font-semibold">{t.status}: {state.status}</span></header>
    <nav aria-label={workspace.title} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {workspaceViews.map((entry)=><a aria-current={view===entry?"page":undefined} className={`inline-flex min-h-11 shrink-0 items-center rounded-md border px-4 text-sm font-semibold ${view===entry?"border-emerald-700 bg-emerald-700 text-white":"border-zinc-300 bg-white"}`} href={`/cabinet/installation-marketplace?view=${entry}`} key={entry}>{workspace.tabs[entry]}</a>)}
    </nav>
    {query.result && <p role="status" className="border-l-4 border-emerald-600 bg-emerald-50 p-3 text-sm">{query.result === "saved" ? t.saved : query.result === "submitted" ? t.submitted : t.enrolled}</p>}
    {view === "overview" ? <Overview locale={locale} state={state} workspace={workspace} /> : null}
    {assignmentView ? <PartnerInstallationLists assignments={assignments} locale={locale} marketplaceProjects={marketplaceProjects} view={assignmentView} /> : null}
    {view === "profile" ? state.status === "NOT_ENROLLED" ? <NotEnrolled t={t} /> : <ActivationWorkspace locale={locale} state={state} t={t} /> : null}
  </main>;
}

function Overview({ locale, state, workspace }: { locale: "ru" | "ro"; state: InstallationPartnerActivation; workspace: typeof workspaceCopy.ru | typeof workspaceCopy.ro }) {
  const labels = locale === "ro" ? ["Solicitări noi", "Instalări active", "Lucrări finalizate", "Recenzii verificate"] : ["Новые заявки", "Активные монтажи", "Завершённые работы", "Проверенные отзывы"];
  const values = [state.metrics.newRequests, state.metrics.activeInstallations, state.metrics.completedInstallations, state.metrics.verifiedReviews];
  const active=state.status==="ACTIVE";
  const actionLabel=active?(locale==="ro"?"Vezi solicitările noi":"Посмотреть новые заявки"):state.status==="NOT_ENROLLED"?(locale==="ro"?"Conectează-te":"Подключиться"):state.status==="PENDING_REVIEW"?(locale==="ro"?"În verificare":"На проверке"):(locale==="ro"?"Continuă configurarea":"Продолжить настройку");
  const actionHref=active?"/cabinet/installation-marketplace?view=new":"/cabinet/installation-marketplace?view=profile";
  return <div className="space-y-4"><section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={workspace.title}>{values.map((value,index)=><div className="border border-zinc-200 bg-white p-4" key={labels[index]}><p className="text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-zinc-600">{labels[index]}</p></div>)}</section><section className="flex flex-wrap items-center justify-between gap-4 border border-zinc-200 bg-white p-5"><div><h2 className="font-semibold">{state.companyName}</h2><p className="mt-1 text-sm text-zinc-600">{state.readiness.eligibleNow ? (locale === "ro" ? "Profilul este activ și poate primi solicitări." : "Профиль активен и может получать заявки.") : (locale === "ro" ? `${state.readiness.blockers.length} pași necesită atenție.` : `Требуют внимания: ${state.readiness.blockers.length}.`)}</p></div><a aria-disabled={state.status==="PENDING_REVIEW"} className={`inline-flex min-h-11 items-center rounded-md px-5 text-sm font-semibold ${state.status==="PENDING_REVIEW"?"pointer-events-none bg-zinc-100 text-zinc-500":"bg-emerald-700 text-white"}`} href={actionHref}>{actionLabel}</a></section></div>;
}

function NotEnrolled({ t }: { t: typeof copy.ru | typeof copy.ro }) {
  return <section className="grid gap-4 border border-zinc-200 bg-white p-5 md:grid-cols-[minmax(0,1fr)_auto]"><div><h2 className="font-semibold">{t.details}</h2><p className="mt-1 text-sm text-zinc-600">{t.intro}</p></div><form action={optInInstallationMarketplaceAction}><button className="min-h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white">{t.optIn}</button></form></section>;
}

function ActivationWorkspace({ locale, state, t }: { locale: "ru" | "ro"; state: InstallationPartnerActivation; t: typeof copy.ru | typeof copy.ro }) {
  const metricValues = [state.metrics.newRequests, state.metrics.activeInstallations, state.metrics.completedInstallations, state.metrics.verifiedReviews];
  const locked = state.status === "PENDING_REVIEW" || state.status === "SUSPENDED";
  return <>
    <section aria-label={t.status} className="grid grid-cols-2 gap-3 lg:grid-cols-4">{metricValues.map((value,index)=><div className="border border-zinc-200 bg-white p-4" key={t.metrics[index]}><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-zinc-600">{t.metrics[index]}</p></div>)}</section>
    {state.status === "REJECTED" && <p className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm"><strong>{t.rejected}.</strong>{state.rejectionNote ? ` ${state.rejectionNote}` : ""}</p>}
    {state.status === "SUSPENDED" && <p className="border-l-4 border-red-600 bg-red-50 p-3 text-sm">{t.suspend}</p>}
    <section className="border border-zinc-200 bg-white p-5"><h2 className="text-lg font-semibold">{t.checklist}</h2><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{state.readiness.items.map((item)=>{const key=readinessLabels[item.code as keyof typeof readinessLabels];return <div className="flex min-h-11 items-center justify-between gap-3 border border-zinc-200 px-3 text-sm" key={item.code}><span>{key ? t[key] : item.code}</span><span className={item.ready ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>{item.ready ? t.ready : t.missing}</span></div>;})}</div></section>
    {locked ? <p className="border border-zinc-200 bg-white p-5 text-sm text-zinc-600">{t.locked}</p> : <ActivationForm locale={locale} state={state} t={t} />}
    {!locked && state.readiness.preAdminReady && !["ACTIVE","APPROVED"].includes(state.status) ? <form action={submitInstallationMarketplaceActivationAction} className="flex justify-end"><input name="revision" type="hidden" value={state.revision}/><button className="min-h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white">{t.submit}</button></form> : null}
  </>;
}

function ActivationForm({ locale, state, t }: { locale: "ru" | "ro"; state: InstallationPartnerActivation; t: typeof copy.ru | typeof copy.ro }) {
  return <form action={saveInstallationMarketplaceActivationAction} className="space-y-5 border border-zinc-200 bg-white p-5"><input name="revision" type="hidden" value={state.revision}/><h2 className="text-lg font-semibold">{t.details}</h2>
    <div className="grid gap-4 md:grid-cols-2"><label className="grid gap-1 text-sm"><span className="font-medium">{t.descriptionRu}</span><textarea className="min-h-28 border border-zinc-300 p-3" defaultValue={state.descriptionRu ?? ""} maxLength={1000} name="descriptionRu"/></label><label className="grid gap-1 text-sm"><span className="font-medium">{t.descriptionRo}</span><textarea className="min-h-28 border border-zinc-300 p-3" defaultValue={state.descriptionRo ?? ""} maxLength={1000} name="descriptionRo"/></label></div>
    <div className="grid gap-4 md:grid-cols-2"><label className="grid gap-1 text-sm"><span className="font-medium">{t.availability}</span><select className="min-h-11 border border-zinc-300 px-3" defaultValue={state.availability} name="availability"><option value="available">{t.available}</option><option value="limited">{t.limited}</option><option value="unavailable">{t.unavailable}</option></select></label><label className="grid gap-1 text-sm"><span className="font-medium">{t.capacity}</span><input className="min-h-11 border border-zinc-300 px-3" defaultValue={state.maxConcurrentJobs ?? ""} max={100} min={1} name="maxConcurrentJobs" type="number"/></label></div>
    <fieldset><legend className="font-semibold">{t.capabilities}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{INSTALLATION_PARTNER_CAPABILITIES.map((code)=>{const selected=state.capabilities.find((value)=>value.code===code);return <label className="flex min-h-11 items-center gap-3 border border-zinc-200 px-3 text-sm" key={code}><input defaultChecked={Boolean(selected)} name="capabilities" type="checkbox" value={code}/><span className="flex-1">{capabilityLabels[locale][code]}</span>{selected && <small className={selected.verificationStatus === "verified" ? "text-emerald-700" : "text-zinc-500"}>{selected.verificationStatus === "verified" ? t.verified : t.selfDeclared}</small>}</label>;})}</div></fieldset>
    <fieldset><legend className="font-semibold">{t.regions}</legend><div className="mt-2 grid max-h-72 gap-2 overflow-y-auto border border-zinc-200 p-2 sm:grid-cols-2 lg:grid-cols-3">{state.regions.map((region)=><label className="flex min-h-11 items-center gap-3 px-2 text-sm" key={region.code}><input defaultChecked={state.serviceAreaCodes.includes(region.code)} name="regions" type="checkbox" value={region.code}/><span>{region.name}</span></label>)}</div></fieldset>
    <div className="grid gap-2"><label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1" defaultChecked={state.termsAccepted} name="acceptTerms" type="checkbox"/><span>{t.termsAccept}<small className="block text-zinc-500">{state.termsVersion}</small></span></label><label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1" defaultChecked={state.privacyAccepted} name="acceptPrivacy" type="checkbox"/><span>{t.privacyAccept}<small className="block text-zinc-500">{state.privacyVersion}</small></span></label></div>
    <div className="flex justify-end"><button className="min-h-11 rounded-md border border-zinc-900 px-5 text-sm font-semibold">{t.save}</button></div>
  </form>;
}
