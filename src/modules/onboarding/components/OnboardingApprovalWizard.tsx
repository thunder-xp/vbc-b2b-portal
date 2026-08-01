"use client";

import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  approveOnboardingRequestV3Action,
  markOnboardingCounterpartyAbsentAction,
  moveOnboardingWizardStepAction,
  refreshOnboardingDirectoryAction,
  resetOnboardingDraftAction,
  saveOnboardingCommercialStepAction,
  saveOnboardingCompanyStepAction,
  saveOnboardingProfileStepAction,
  type OnboardingWizardActionState,
  type OnboardingDirectoryRefreshActionState,
} from "../actions";
import {
  ONBOARDING_BUSINESS_PROFILES,
  ONBOARDING_PAYMENT_MODEL_LABELS,
  type OnboardingBusinessProfileCode,
  type OnboardingPaymentModel,
} from "../business-profiles";
import type { OnboardingDetail, OnboardingStatus } from "../types";

const STEPS = [
  { number: 1, label: "Компания", icon: Building2 },
  { number: 2, label: "Коммерческие условия", icon: CircleDollarSign },
  { number: 3, label: "Доступ пользователя", icon: UserRound },
  { number: 4, label: "Финальная проверка", icon: ShieldCheck },
] as const;

const INITIAL_ACTION_STATE: OnboardingWizardActionState = {
  success: true,
  errorCode: null,
  message: "",
  data: null,
};

const INITIAL_REFRESH_STATE: OnboardingDirectoryRefreshActionState = {
  success: true,
  errorCode: null,
  message: "",
  data: { correlationId: "", deduplicated: false, published: null },
};

type OnboardingWizardDetail = Pick<
  OnboardingDetail,
  "candidates" | "companyVerification" | "directoryFiscalMatchCount" | "draft" | "duplicates" | "managers" | "revision"
> & {
  request: {
    id: string;
    status: OnboardingStatus;
  };
};

export function OnboardingApprovalWizard({ detail }: { detail: OnboardingWizardDetail }) {
  const draft = detail.draft;
  const [companyState, companyAction] = useActionState(saveOnboardingCompanyStepAction, INITIAL_ACTION_STATE);
  const [commercialState, commercialAction] = useActionState(saveOnboardingCommercialStepAction, INITIAL_ACTION_STATE);
  const [profileState, profileAction] = useActionState(saveOnboardingProfileStepAction, INITIAL_ACTION_STATE);
  const [navigationState, navigationAction] = useActionState(moveOnboardingWizardStepAction, INITIAL_ACTION_STATE);
  const [resetState, resetAction] = useActionState(resetOnboardingDraftAction, INITIAL_ACTION_STATE);
  const [approvalState, approvalAction] = useActionState(approveOnboardingRequestV3Action, INITIAL_ACTION_STATE);
  const [refreshState, refreshAction] = useActionState(refreshOnboardingDirectoryAction, INITIAL_REFRESH_STATE);
  const [waitingState, waitingAction] = useActionState(markOnboardingCounterpartyAbsentAction, INITIAL_ACTION_STATE);
  const states = [companyState, commercialState, profileState, navigationState, resetState, approvalState, refreshState, waitingState];
  const feedback = states.find((state) => !state.success)
    ?? [...states].reverse().find((state) => state.message);

  if (!draft) {
    return (
      <section className="border-b border-zinc-200 pb-6">
        <h2 className="text-lg font-semibold">Результат подключения</h2>
        <p className="mt-2 text-sm text-zinc-600">
          {detail.request.status === "approved"
            ? "Доступ открыт. Компания и пользователь подключены."
            : "Для завершённой заявки черновик подключения недоступен."}
        </p>
      </section>
    );
  }

  if (detail.request.status === "received") {
    return (
      <section className="border-l-4 border-zinc-300 bg-zinc-50 p-4">
        <h2 className="font-semibold">Подключение партнёра</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Начните проверку заявки, чтобы открыть мастер подключения.
        </p>
      </section>
    );
  }

  if (detail.request.status === "clarification_requested") {
    return (
      <section className="border-l-4 border-amber-500 bg-amber-50 p-4">
        <h2 className="font-semibold text-amber-950">Ожидается ответ партнёра</h2>
        <p className="mt-1 text-sm text-amber-900">
          Черновик сохранён. Одобрение недоступно до получения новой редакции заявки.
        </p>
      </section>
    );
  }

  if (draft.stale) {
    return (
      <section className="border-l-4 border-amber-500 bg-amber-50 p-4">
        <h2 className="font-semibold text-amber-950">Заявка была обновлена</h2>
        <p className="mt-1 text-sm text-amber-900">
          Обновите черновик, чтобы использовать последнюю редакцию данных партнёра.
        </p>
        <form action={resetAction} className="mt-4">
          <input type="hidden" name="requestId" value={detail.request.id} />
          <SubmitButton label="Обновить черновик" pendingLabel="Обновление..." />
        </form>
      </section>
    );
  }

  const selectedCandidate = detail.candidates.find((candidate) => candidate.id === draft.confirmedCounterpartyId);
  const selectedManager = detail.managers.find((manager) => manager.id === draft.assignedManagerId);
  const selectedPriceProfile = selectedCandidate?.priceProfiles.find((profile) => profile.id === draft.selectedPriceProfileId);
  const selectedProfile = draft.initialBusinessProfile
    ? ONBOARDING_BUSINESS_PROFILES[draft.initialBusinessProfile as OnboardingBusinessProfileCode]
    : null;

  return (
    <section aria-labelledby="approval-wizard-title" className="border-b border-zinc-200 pb-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="approval-wizard-title" className="text-lg font-semibold">Подключение партнёра</h2>
          <p className="mt-1 text-sm text-zinc-600">Шаг {draft.currentStep} из 4. Черновик сохранён на сервере.</p>
        </div>
        <p className="text-xs text-zinc-500">Обновлено {formatDate(draft.updatedAt)}</p>
      </div>

      <ol className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Этапы подключения">
        {STEPS.map(({ number, label, icon: Icon }) => {
          const completed = number < draft.currentStep;
          const active = number === draft.currentStep;
          return (
            <li key={number} aria-current={active ? "step" : undefined} className={`flex min-h-11 items-center gap-2 border-b-2 px-2 py-2 text-sm font-medium ${active ? "border-emerald-700 text-emerald-800" : completed ? "border-emerald-300 text-zinc-800" : "border-zinc-200 text-zinc-500"}`}>
              {completed ? <Check className="h-4 w-4" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
              {label}
            </li>
          );
        })}
      </ol>

      {feedback?.message && (
        <div role={feedback.success ? "status" : "alert"} className={`mt-5 border-l-4 p-3 text-sm ${feedback.success ? "border-emerald-600 bg-emerald-50 text-emerald-950" : "border-red-600 bg-red-50 text-red-950"}`}>
          {feedback.message}
        </div>
      )}

      <div className="mt-6">
        {draft.currentStep === 1 && <CompanyStep detail={detail} action={companyAction} refreshAction={refreshAction} waitingAction={waitingAction} draft={draft} />}
        {draft.currentStep === 2 && <CommercialStep detail={detail} action={commercialAction} draft={draft} candidate={selectedCandidate} backAction={navigationAction} />}
        {draft.currentStep === 3 && <ProfileStep action={profileAction} draft={draft} requestId={detail.request.id} backAction={navigationAction} />}
        {draft.currentStep === 4 && (
          <ReviewStep
            detail={detail}
            action={approvalAction}
            backAction={navigationAction}
            draft={draft}
            candidateName={selectedCandidate?.companyName ?? "Не выбрана"}
            managerName={selectedManager?.name ?? "Не назначен"}
            priceProfileName={selectedProfile?.code === "retail_only" ? "Только розничные цены" : selectedPriceProfile?.name ?? "Не выбран"}
            profile={selectedProfile}
          />
        )}
      </div>
    </section>
  );
}

function CompanyStep({ detail, action, refreshAction, waitingAction, draft }: {
  detail: OnboardingWizardDetail;
  action: (payload: FormData) => void;
  refreshAction: (payload: FormData) => void;
  waitingAction: (payload: FormData) => void;
  draft: NonNullable<OnboardingDetail["draft"]>;
}) {
  const verification = detail.companyVerification;
  const exactCandidates = detail.candidates.filter((candidate) =>
    verification.exactCandidateIds.includes(candidate.id),
  );
  const blockedByDuplicate = verification.outcome === "multiple_matches";
  const waiting = detail.request.status === "awaiting_1c_company";

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold">1. Проверка компании</h3>
        <p className="mt-1 text-sm text-zinc-600">Для активации кабинета контрагент должен существовать в 1С. Допускается только точное совпадение по IDNO; название и контакты не подтверждают компанию.</p>
      </div>

      <dl className="grid gap-3 border-y border-zinc-200 py-4 text-sm sm:grid-cols-2">
        <ReviewValue label="Компания" value={detail.revision.companyName} />
        <ReviewValue label="IDNO" value={detail.revision.fiscalCode || "Не указан"} />
        <ReviewValue label="Последняя успешная синхронизация" value={verification.lastSuccessfulDirectorySyncAt ? formatDate(verification.lastSuccessfulDirectorySyncAt) : "Нет успешной синхронизации"} />
        <ReviewValue label="Актуальность справочника" value={directoryFreshnessLabel(verification.directoryFreshness)} />
        <ReviewValue label="Точных кандидатов по IDNO" value={String(verification.exactCandidateCount)} />
        <ReviewValue label="Кто должен действовать" value={verification.responsibleParty} />
      </dl>

      <div role={verification.blocked ? "alert" : "status"} className={`border-l-4 p-4 text-sm ${verification.blocked ? "border-amber-500 bg-amber-50 text-amber-950" : "border-emerald-600 bg-emerald-50 text-emerald-950"}`}>
        <p className="font-semibold">{verification.reason}</p>
        <p className="mt-1">Следующее действие: {verification.nextAction}</p>
        {waiting && verification.waitingSince ? <p className="mt-2">Ожидание с {formatDate(verification.waitingSince)}. Черновик подключения сохранён.</p> : null}
        {verification.waitingInternalNote ? <p className="mt-2 border-t border-amber-200 pt-2">Внутренняя заметка: {verification.waitingInternalNote}</p> : null}
      </div>

      {exactCandidates.length > 0 ? (
        <form action={action} className="space-y-5">
          <DraftFields detail={detail} draft={draft} />
          <fieldset className="space-y-3" disabled={blockedByDuplicate || verification.outcome === "counterparty_inactive"}>
          <legend className="sr-only">Контрагент из 1С</legend>
          {exactCandidates.map((candidate) => {
            const blocked = !candidate.active;
            return (
              <label key={candidate.id} className="flex min-h-11 cursor-pointer gap-3 border-b border-zinc-200 py-3">
                <input type="radio" name="counterpartyId" value={candidate.id} defaultChecked={candidate.id === draft.confirmedCounterpartyId} disabled={blocked} required className="mt-1 h-4 w-4 accent-emerald-700" />
                <span className="min-w-0">
                  <span className="block font-medium">{candidate.companyName}</span>
                  <span className="mt-1 block text-sm text-zinc-600">IDNO: {candidate.fiscalCode || "не указан"} · {candidate.locality || "населённый пункт не указан"}</span>
                  <span className="mt-1 block text-xs text-zinc-500">Договоров: {candidate.contractCount} · статусов партнёра: {candidate.priceProfileCount} · данные от {formatDate(candidate.synchronizedAt)}</span>
                  {!candidate.active && <span className="mt-1 block text-sm font-medium text-red-700">Компания неактивна</span>}
                  {candidate.portalLinkageState === "already_linked" && candidate.active && <span className="mt-1 block text-sm font-medium text-emerald-800">Существующая компания портала будет использована повторно после проверки.</span>}
                </span>
              </label>
            );
          })}
          </fieldset>
          <div className="flex justify-end"><SubmitButton label="Подтвердить и продолжить" pendingLabel="Сохранение..." icon="next" disabled={verification.blocked} /></div>
        </form>
      ) : null}

      {verification.blocked ? (
        <div className="space-y-4 border-t border-zinc-200 pt-5">
          <form action={refreshAction}>
            <input type="hidden" name="requestId" value={detail.request.id} />
            <SubmitButton label="Обновить справочник 1С" pendingLabel="Обновление справочника..." />
          </form>
          {!waiting && verification.outcome === "no_match" ? (
            <form action={waitingAction} className="space-y-4 rounded-md border border-zinc-200 p-4">
              <input type="hidden" name="requestId" value={detail.request.id} />
              <label className="block text-sm font-medium">Ответственный за создание контрагента<select name="assigneeUserId" defaultValue={draft.assignedManagerId ?? ""} className="mt-2 min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3"><option value="">Не назначать</option>{detail.managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label>
              <label className="block text-sm font-medium">Внутренняя заметка <span className="font-normal text-zinc-500">(необязательно)</span><textarea name="internalNote" maxLength={1000} rows={3} className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2" /></label>
              <SubmitButton label="Отметить: контрагент отсутствует в 1С" pendingLabel="Сохранение..." />
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CommercialStep({ detail, action, draft, candidate, backAction }: { detail: OnboardingWizardDetail; action: (payload: FormData) => void; draft: NonNullable<OnboardingDetail["draft"]>; candidate: OnboardingDetail["candidates"][number] | undefined; backAction: (payload: FormData) => void }) {
  return (
    <div className="space-y-5">
      <div><h3 className="font-semibold">2. Коммерческие условия</h3><p className="mt-1 text-sm text-zinc-600">Компания: {candidate?.companyName ?? "не выбрана"}. Договоров в 1С: {candidate?.contracts.length ?? 0}.</p></div>
      <form action={action} className="grid gap-5 sm:grid-cols-2">
        <DraftFields detail={detail} draft={draft} />
        <label className="text-sm font-medium">Ответственный менеджер Novotech<select name="assignedManagerId" defaultValue={draft.assignedManagerId ?? ""} required className="mt-2 min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3"><option value="" disabled>Выберите менеджера</option>{detail.managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label>
        <label className="text-sm font-medium">Статус партнёра<select name="priceProfileId" defaultValue={draft.selectedPriceProfileId ?? ""} className="mt-2 min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3"><option value="">Не назначать (только розничные цены)</option>{candidate?.priceProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.code ? ` (${profile.code})` : ""}</option>)}</select></label>
        <label className="text-sm font-medium">Модель оплаты<select name="paymentModel" defaultValue={draft.paymentModel ?? "inherited_from_1c"} required className="mt-2 min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3">{Object.entries(ONBOARDING_PAYMENT_MODEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="mt-1 block text-xs font-normal text-zinc-500">Финансовые условия остаются авторитетными в 1С.</span></label>
        <fieldset className="space-y-3 text-sm"><legend className="font-medium">Доступ компании</legend><label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="orderAccess" defaultChecked={draft.orderAccess} className="h-4 w-4 accent-emerald-700" /> Заказы разрешены</label><label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="financeAccess" defaultChecked={draft.financeAccess} className="h-4 w-4 accent-emerald-700" /> Финансы доступны</label></fieldset>
        <div className="flex gap-3 sm:col-span-2 sm:justify-between"><BackButton step={1} action={backAction} /><SubmitButton label="Сохранить и продолжить" pendingLabel="Сохранение..." icon="next" /></div>
      </form>
    </div>
  );
}

function ProfileStep({ action, draft, requestId, backAction }: { action: (payload: FormData) => void; draft: NonNullable<OnboardingDetail["draft"]>; requestId: string; backAction: (payload: FormData) => void }) {
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="requestRevision" value={draft.requestRevisionNumber} /><input type="hidden" name="draftVersion" value={draft.version} />
      <div><h3 className="font-semibold">3. Начальный пользователь</h3><p className="mt-1 text-sm text-zinc-600">Выберите одну управляемую бизнес-роль. Отдельные технические права не настраиваются.</p></div>
      <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="sr-only">Бизнес-профиль пользователя</legend>{Object.values(ONBOARDING_BUSINESS_PROFILES).map((profile) => <label key={profile.code} className="flex min-h-20 cursor-pointer gap-3 border-b border-zinc-200 py-3"><input type="radio" name="initialProfile" value={profile.code} defaultChecked={profile.code === (draft.initialBusinessProfile ?? "owner")} required className="mt-1 h-4 w-4 accent-emerald-700" /><span><span className="block font-medium">{profile.label}</span><span className="mt-1 block text-sm text-zinc-600">{profile.summary}</span></span></label>)}</fieldset>
      <div className="flex gap-3 sm:justify-between"><BackButtonRaw step={2} action={backAction} /><SubmitButton label="Сохранить и проверить" pendingLabel="Сохранение..." icon="next" /></div>
    </form>
  );
}

function ReviewStep({ detail, action, backAction, draft, candidateName, managerName, priceProfileName, profile }: { detail: OnboardingWizardDetail; action: (payload: FormData) => void; backAction: (payload: FormData) => void; draft: NonNullable<OnboardingDetail["draft"]>; candidateName: string; managerName: string; priceProfileName: string; profile: (typeof ONBOARDING_BUSINESS_PROFILES)[OnboardingBusinessProfileCode] | null }) {
  const ready = detail.request.status === "ready_for_approval";
  return (
    <form action={action} className="space-y-5">
      <DraftFields detail={detail} draft={draft} /><input type="hidden" name="attemptKey" value={draft.attemptKey} />
      <div><h3 className="font-semibold">4. Итоговая проверка</h3><p className="mt-1 text-sm text-zinc-600">После подтверждения компания и доступ пользователя будут созданы одной операцией.</p></div>
      <dl className="grid gap-4 border-y border-zinc-200 py-5 sm:grid-cols-2"><ReviewValue label="Компания" value={candidateName} /><ReviewValue label="Менеджер Novotech" value={managerName} /><ReviewValue label="Статус партнёра" value={priceProfileName} /><ReviewValue label="Модель оплаты" value={ONBOARDING_PAYMENT_MODEL_LABELS[draft.paymentModel as OnboardingPaymentModel] ?? "Не выбрана"} /><ReviewValue label="Профиль пользователя" value={profile?.label ?? "Не выбран"} /><ReviewValue label="Заказы" value={draft.orderAccess ? "Разрешены" : "Недоступны"} /><ReviewValue label="Финансы" value={draft.financeAccess ? "Доступны" : "Недоступны"} /><ReviewValue label="Результат" value="Активная компания и активный доступ" /></dl>
      {!ready && <p role="alert" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950">Статус заявки изменился. Обновите страницу перед одобрением.</p>}
      <label className="flex min-h-11 items-start gap-3 text-sm font-medium"><input type="checkbox" name="confirmed" required className="mt-1 h-4 w-4 accent-emerald-700" />Я проверил компанию и выбранные условия доступа.</label>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><BackButton step={3} action={backAction} /><SubmitButton label="Одобрить и открыть доступ" pendingLabel="Подключение..." disabled={!ready} /></div>
    </form>
  );
}

function DraftFields({ detail, draft }: { detail: OnboardingWizardDetail; draft: NonNullable<OnboardingDetail["draft"]> }) {
  return <><input type="hidden" name="requestId" value={detail.request.id} /><input type="hidden" name="requestRevision" value={draft.requestRevisionNumber} /><input type="hidden" name="draftVersion" value={draft.version} /></>;
}

function BackButton({ step, action }: { step: number; action: (payload: FormData) => void }) {
  return <BackButtonRaw step={step} action={action} />;
}

function BackButtonRaw({ step, action }: { step: number; action: (payload: FormData) => void }) {
  return <button formAction={action} name="step" value={step} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-50"><ChevronLeft className="h-4 w-4" aria-hidden /> Назад</button>;
}

function SubmitButton({ label, pendingLabel, icon, disabled = false }: { label: string; pendingLabel: string; icon?: "next"; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={disabled || pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400">{pending ? pendingLabel : label}{icon && !pending && <ChevronRight className="h-4 w-4" aria-hidden />}</button>;
}

function ReviewValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-sm text-zinc-500">{label}</dt><dd className="mt-1 font-medium text-zinc-900">{value}</dd></div>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Chisinau", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function directoryFreshnessLabel(value: OnboardingDetail["companyVerification"]["directoryFreshness"]): string {
  return {
    fresh: "Актуален",
    stale: "Требуется обновление",
    failed: "Последнее обновление завершилось ошибкой",
    unavailable: "Нет данных",
  }[value];
}
