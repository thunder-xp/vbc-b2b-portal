"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { createClient } from "@/src/lib/supabase/client";

import { activateInternalInvitationAction } from "../actions/internal-invitation.actions";
import { PASSWORD_MIN_LENGTH, passwordPolicyIssue } from "../password-policy";

export function InternalInvitationActivationForm() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [sessionReady, setSessionReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSessionReady(Boolean(data.session));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setSessionReady(Boolean(session));
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    setPending(true);
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) {
      setPending(false);
      setError("Не удалось установить пароль. Откройте ссылку приглашения ещё раз.");
      return;
    }
    const activation = await activateInternalInvitationAction();
    if (!activation.success) {
      setPending(false);
      setError("Пароль сохранён, но внутренний доступ не активирован. Обратитесь к администратору.");
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <form className="mt-6 grid gap-4" onSubmit={submit}>
      <label className="grid gap-1 text-sm font-medium">
        Новый пароль
        <input autoComplete="new-password" className="min-h-11 border border-zinc-300 px-3" disabled={!sessionReady || pending} minLength={PASSWORD_MIN_LENGTH} name="password" required type="password" />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Повторите пароль
        <input autoComplete="new-password" className="min-h-11 border border-zinc-300 px-3" disabled={!sessionReady || pending} minLength={PASSWORD_MIN_LENGTH} name="confirmation" required type="password" />
      </label>
      {!sessionReady ? <p className="text-sm text-amber-800">Проверяем защищённую ссылку приглашения…</p> : null}
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      <button className="min-h-11 bg-zinc-950 px-4 text-sm font-semibold text-white disabled:bg-zinc-400" disabled={!sessionReady || pending}>
        {pending ? "Активация…" : "Установить пароль и активировать доступ"}
      </button>
    </form>
  );
}
