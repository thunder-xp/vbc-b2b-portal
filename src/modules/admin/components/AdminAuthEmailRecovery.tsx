"use client";

import { useActionState } from "react";

import {
  diagnoseAuthEmailRecoveryAction,
  executeAuthEmailRecoveryAction,
  type AuthEmailRecoveryDiagnosticActionState,
  type AuthEmailRecoveryExecutionActionState,
} from "../actions";

const diagnosticInitial: AuthEmailRecoveryDiagnosticActionState = {
  status: "idle",
  message: "",
  diagnosis: null,
  correlationId: null,
};

const executionInitial: AuthEmailRecoveryExecutionActionState = {
  status: "idle",
  message: "",
  correlationId: null,
};

export function AdminAuthEmailRecovery() {
  const [diagnostic, diagnose, diagnosing] = useActionState(diagnoseAuthEmailRecoveryAction, diagnosticInitial);
  return (
    <section aria-labelledby="auth-email-recovery-title" className="border border-zinc-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Контролируемое восстановление</p>
      <h2 className="mt-1 text-lg font-semibold" id="auth-email-recovery-title">Резервный канал подтверждения email</h2>
      <p className="mt-1 max-w-3xl text-sm text-zinc-600">
        Используйте только для существующей неподтверждённой идентичности, когда обычный Supabase resend завершился ошибкой email_address_invalid, а домен и почтовый ящик проверены отдельно.
      </p>
      <form action={diagnose} className="mt-4 grid gap-3 sm:grid-cols-[minmax(16rem,28rem)_auto]">
        <label className="grid gap-1 text-sm font-medium">
          Email для диагностики
          <input autoComplete="off" className="min-h-11 border border-zinc-300 px-3" maxLength={254} name="email" required type="email" />
        </label>
        <button className="min-h-11 self-end bg-zinc-950 px-4 text-sm font-semibold text-white disabled:bg-zinc-400" disabled={diagnosing}>
          {diagnosing ? "Проверка…" : "Проверить состояние"}
        </button>
      </form>
      {diagnostic.status !== "idle" ? (
        <p className={`mt-3 text-sm ${diagnostic.status === "error" ? "text-red-700" : "text-zinc-700"}`} role={diagnostic.status === "error" ? "alert" : "status"}>
          {diagnostic.message}
        </p>
      ) : null}
      {diagnostic.diagnosis ? (
        <RecoveryDiagnosis
          correlationId={diagnostic.correlationId}
          diagnosis={diagnostic.diagnosis}
        />
      ) : null}
    </section>
  );
}

function RecoveryDiagnosis({ correlationId, diagnosis }: {
  correlationId: string | null;
  diagnosis: NonNullable<AuthEmailRecoveryDiagnosticActionState["diagnosis"]>;
}) {
  const [execution, execute, executing] = useActionState(executeAuthEmailRecoveryAction, executionInitial);
  return (
    <div className="mt-4 border-t border-zinc-200 pt-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <State label="Email" value={diagnosis.maskedEmail} />
        <State label="Auth-состояние" value={identityStateLabel(diagnosis.identityState)} />
        <State label="Исходная ошибка" value={diagnosis.originalErrorCode} />
        <State label="Онбординг" value={diagnosis.profileState === "PRESENT" ? `Профиль: ${diagnosis.profileStatus ?? "создан"}` : "Не начат"} />
      </dl>
      {diagnosis.latestAttemptStatus ? (
        <p className="mt-3 text-xs text-zinc-600">
          Последняя попытка: {diagnosis.latestAttemptStatus}; доставка: {diagnosis.deliveryResult ?? "—"}; проверка: {diagnosis.verificationResult ?? "—"}.
        </p>
      ) : null}
      {diagnosis.eligible && diagnosis.authUserId && correlationId ? (
        <form action={execute} className="mt-4 grid max-w-3xl gap-3 border border-amber-200 bg-amber-50 p-4">
          <input name="authUserId" type="hidden" value={diagnosis.authUserId} />
          <input name="correlationId" type="hidden" value={correlationId} />
          <Evidence name="originalErrorConfirmed">Обычная отправка действительно завершилась email_address_invalid до Send Email Hook.</Evidence>
          <Evidence name="mailboxValidityConfirmed">Синтаксис, DNS/MX и получение обычной почты проверены независимо.</Evidence>
          <Evidence name="explicitlyAuthorized">Администратор явно разрешает одну отправку через резервный канал.</Evidence>
          <button className="min-h-11 justify-self-start bg-amber-800 px-4 text-sm font-semibold text-white disabled:bg-zinc-400" disabled={executing}>
            {executing ? "Отправка…" : "Отправить подтверждение через резервный канал"}
          </button>
        </form>
      ) : null}
      {execution.status !== "idle" ? (
        <p className={`mt-3 text-sm font-medium ${execution.status === "accepted" ? "text-emerald-700" : execution.status === "partial" ? "text-amber-800" : "text-red-700"}`} role={execution.status === "accepted" ? "status" : "alert"}>
          {execution.message}{execution.correlationId ? ` Корреляция: ${execution.correlationId}.` : ""}
        </p>
      ) : null}
    </div>
  );
}

function Evidence({ children, name }: { children: React.ReactNode; name: string }) {
  return (
    <label className="flex items-start gap-2 text-sm text-zinc-800">
      <input className="mt-1 size-4" name={name} required type="checkbox" />
      <span>{children}</span>
    </label>
  );
}

function State({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 font-medium text-zinc-900">{value}</dd></div>;
}

function identityStateLabel(value: NonNullable<AuthEmailRecoveryDiagnosticActionState["diagnosis"]>["identityState"]): string {
  return {
    UNKNOWN: "Не найден",
    AMBIGUOUS: "Неоднозначен",
    UNCONFIRMED: "Не подтверждён",
    CONFIRMED: "Подтверждён",
  }[value];
}
