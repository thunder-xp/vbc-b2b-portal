"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";

import { createClient } from "@/src/lib/supabase/client";

import {
  activateInternalInvitationAction,
  getInternalInvitationReadinessAction,
  type InternalInvitationActivationState,
} from "../actions/internal-invitation.actions";
import { PASSWORD_MIN_LENGTH, passwordPolicyIssue } from "../password-policy";

type Props = { initialState: InternalInvitationActivationState };

export function InternalInvitationActivationForm({ initialState }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<InternalInvitationActivationState>(initialState);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialState !== "VERIFYING") return;
    let active = true;

    void bounded(bootstrapInvitationSession(supabase), 12_000)
      .then(async (bootstrapState) => {
        if (!active) return;
        if (bootstrapState) {
          setState(bootstrapState);
          return;
        }
        const readiness = await bounded(getInternalInvitationReadinessAction(), 12_000);
        if (active) setState(readiness.state);
      })
      .catch(() => {
        if (active) setState("ERROR");
      });

    return () => {
      active = false;
    };
  }, [initialState, supabase]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state !== "READY") return;
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (passwordPolicyIssue(password)) {
      setError(`Пароль должен содержать минимум ${PASSWORD_MIN_LENGTH} символов.`);
      return;
    }
    if (password !== confirmation) {
      setError("Пароли не совпадают.");
      return;
    }

    setState("ACTIVATING");
    const activation = await activateInternalInvitationAction(password);
    if (!activation.success) {
      if (activation.error === "invalid_password") {
        setState("READY");
        setError(`Пароль должен содержать не менее ${PASSWORD_MIN_LENGTH} символов.`);
      } else {
        setState("ERROR");
        setError("Не удалось активировать внутренний доступ. Войдите с уже установленным паролем, чтобы безопасно завершить активацию.");
      }
      return;
    }

    setState("COMPLETED");
    router.replace("/admin");
    router.refresh();
  }

  const ready = state === "READY";
  const activating = state === "ACTIVATING";
  const showForm = state === "VERIFYING" || ready || activating;

  return (
    <div className="mt-6">
      {showForm ? (
        <form className="grid gap-4" onSubmit={submit}>
          <label className="grid gap-1 text-sm font-medium">
            Новый пароль
            <input autoComplete="new-password" className="min-h-11 border border-zinc-300 px-3" disabled={!ready || activating} minLength={PASSWORD_MIN_LENGTH} name="password" required type="password" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Повторите пароль
            <input autoComplete="new-password" className="min-h-11 border border-zinc-300 px-3" disabled={!ready || activating} minLength={PASSWORD_MIN_LENGTH} name="confirmation" required type="password" />
          </label>
          {state === "VERIFYING" ? <Status tone="pending">Проверяем защищённую ссылку приглашения…</Status> : null}
          {error ? <Status tone="error">{error}</Status> : null}
          <button className="min-h-11 bg-zinc-950 px-4 text-sm font-semibold text-white disabled:bg-zinc-400" disabled={!ready || activating}>
            {activating ? "Активация…" : "Установить пароль и активировать доступ"}
          </button>
        </form>
      ) : null}

      {state === "INVALID_INVITE" ? <TerminalMessage>Ссылка приглашения недействительна. Запросите новое приглашение у администратора.</TerminalMessage> : null}
      {state === "EXPIRED_INVITE" ? <TerminalMessage>Ссылка приглашения недействительна или истекла. Запросите новое приглашение у администратора.</TerminalMessage> : null}
      {state === "ALREADY_USED" ? <TerminalMessage>Учётная запись уже активирована. Войдите с установленным паролем.</TerminalMessage> : null}
      {state === "ERROR" ? <TerminalMessage>{error ?? "Не удалось завершить активацию."}</TerminalMessage> : null}
      {state === "COMPLETED" ? <Status tone="success">Доступ активирован. Открываем рабочее пространство…</Status> : null}
      {state === "INVALID_INVITE" || state === "EXPIRED_INVITE" || state === "ALREADY_USED" ? (
        <Link className="mt-4 flex min-h-11 items-center justify-center border border-zinc-300 px-4 text-sm font-semibold" href="/auth/sign-in">Перейти ко входу</Link>
      ) : null}
      {state === "ERROR" ? (
        <Link className="mt-4 flex min-h-11 items-center justify-center border border-zinc-300 px-4 text-sm font-semibold" href="/auth/sign-in?next=%2Fauth%2Finternal-invitation">Войти и завершить активацию</Link>
      ) : null}
    </div>
  );
}

async function bootstrapInvitationSession(
  supabase: ReturnType<typeof createClient>,
): Promise<InternalInvitationActivationState | null> {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const errorCode = params.get("error_code");
  const errorDescription = params.get("error_description");
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (window.location.hash) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }

  if (errorCode || errorDescription) {
    const signal = `${errorCode ?? ""} ${errorDescription ?? ""}`.toLowerCase();
    return signal.includes("expired") || signal.includes("otp_expired")
      ? "EXPIRED_INVITE"
      : "INVALID_INVITE";
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) return "INVALID_INVITE";
  }

  return null;
}

function bounded<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("INVITATION_VERIFICATION_TIMEOUT")), timeoutMs);
    operation.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (reason) => {
        window.clearTimeout(timeout);
        reject(reason);
      },
    );
  });
}

function Status({ children, tone }: { children: ReactNode; tone: "pending" | "error" | "success" }) {
  const color = tone === "error" ? "text-red-700" : tone === "success" ? "text-emerald-700" : "text-amber-800";
  return <p className={`text-sm ${color}`} role={tone === "error" ? "alert" : "status"}>{children}</p>;
}

function TerminalMessage({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-zinc-700" role="alert">{children}</p>;
}
