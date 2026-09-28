"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import { PASSWORD_MIN_LENGTH, passwordPolicyIssue } from "../password-policy";

export function PasswordRecoveryForm() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    async function bootstrap() {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = params.get("access_token"); const refreshToken = params.get("refresh_token");
      if (window.location.hash) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (sessionError) { if (active) setError("Сессия восстановления недействительна. Запросите новую ссылку."); return; }
      }
      const { data } = await supabase.auth.getUser();
      if (active) { setReady(Boolean(data.user)); if (!data.user) setError("Сессия восстановления недействительна. Запросите новую ссылку."); }
    }
    void bootstrap(); return () => { active = false; };
  }, [supabase]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    const form = new FormData(event.currentTarget); const password = String(form.get("password") ?? ""); const confirmation = String(form.get("confirmation") ?? "");
    if (passwordPolicyIssue(password)) { setError(`Пароль должен содержать минимум ${PASSWORD_MIN_LENGTH} символов.`); return; }
    if (password !== confirmation) { setError("Пароли не совпадают."); return; }
    setBusy(true);
    const { data } = await supabase.auth.getUser();
    if (!data.user) { setBusy(false); setError("Сессия восстановления недействительна. Запросите новую ссылку."); return; }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) { setBusy(false); setError("Не удалось изменить пароль. Запросите новую ссылку."); return; }
    await supabase.auth.signOut(); router.replace("/auth/sign-in?password_reset=1"); router.refresh();
  }
  return <form className="mt-6 grid gap-4" onSubmit={submit}><label className="grid gap-1 text-sm font-medium">Новый пароль<input autoComplete="new-password" className="min-h-11 border border-zinc-300 px-3" disabled={busy || !ready} minLength={PASSWORD_MIN_LENGTH} name="password" required type="password"/></label><label className="grid gap-1 text-sm font-medium">Повторите пароль<input autoComplete="new-password" className="min-h-11 border border-zinc-300 px-3" disabled={busy || !ready} minLength={PASSWORD_MIN_LENGTH} name="confirmation" required type="password"/></label>{!ready && !error ? <p className="text-sm text-amber-800" role="status">Проверяем защищённую ссылку…</p> : null}{error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}<button className="min-h-11 bg-zinc-950 px-4 text-sm font-semibold text-white disabled:bg-zinc-400" disabled={busy || !ready} type="submit">{busy ? "Сохраняем…" : "Сохранить новый пароль"}</button></form>;
}
