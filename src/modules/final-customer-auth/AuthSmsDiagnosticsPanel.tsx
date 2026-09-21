import type { AuthSmsDiagnostic, BusinessPhoneHealth } from "./auth-sms-diagnostics.repository";

export function AuthSmsDiagnosticsPanel({ attempts, health }: { attempts: readonly AuthSmsDiagnostic[]; health: BusinessPhoneHealth }) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-5" aria-labelledby="auth-sms-diagnostics-title">
      <div>
        <h2 className="font-semibold text-zinc-950" id="auth-sms-diagnostics-title">SMS-подтверждение телефона</h2>
        <p className="mt-1 text-sm text-zinc-600">Безопасная диагностика отправки и проверки OTP. Код OTP не сохраняется и не отображается.</p>
      </div>
      <dl className="mt-4 grid gap-px border border-zinc-200 bg-zinc-200 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="B2B users" value={health.summary.totalActiveB2b} />
        <Metric label="Verified" value={health.summary.verifiedHealthy} />
        <Metric label="Pending" value={health.summary.pendingVerification} />
        <Metric label="Malformed" value={health.summary.malformedPhone} />
        <Metric label="Mismatches" value={health.summary.authProfilePhoneMismatch + health.summary.verifiedStateMismatch} />
        <Metric label="Profile only" value={health.summary.orphanedProfilePhone} />
      </dl>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="text-zinc-500"><tr><th className="pb-2">Window</th><th className="pb-2">Challenges</th><th className="pb-2">Sends</th><th className="pb-2">Accepted</th><th className="pb-2">Provider failures</th><th className="pb-2">Network failures</th><th className="pb-2">Verified / failed</th><th className="pb-2">Expired</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {health.windows.map((window) => <tr key={window.window_name}>
              <td className="py-2 font-medium">{window.window_name}</td><td>{window.challenge_attempts}</td><td>{window.send_attempts}</td><td>{window.provider_accepted}</td><td>{window.provider_rejected}</td><td>{window.network_failures}</td><td>{window.verification_success} / {window.verification_failure}</td><td>{window.challenge_expiration}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {health.accounts.length ? <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="text-zinc-500"><tr><th className="pb-2">User / company</th><th className="pb-2">Phone state</th><th className="pb-2">Stage / safe code</th><th className="pb-2">Provider</th><th className="pb-2">Attempt</th><th className="pb-2">Correlation</th><th className="pb-2">Recovery</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">{health.accounts.map((account) => <tr key={account.authUserId}>
            <td className="py-3"><span className="block font-medium">{account.account ?? account.authUserId}</span><span className="text-xs text-zinc-500">{account.companies.join(", ") || "—"}</span></td>
            <td className="py-3"><span className="block font-mono text-xs">{account.maskedPhone}</span><span className="text-xs text-zinc-500">{account.classifications.join(", ")}</span></td>
            <td className="py-3">{account.stage ?? "—"}<span className="block text-xs text-zinc-500">{account.safeCode ?? "—"}</span></td>
            <td className="py-3">{account.provider ?? "—"} · {account.transport ?? "—"}<span className="block text-xs text-zinc-500">{account.httpStatus ?? "—"} · {account.providerCode ?? "—"}</span></td>
            <td className="py-3">{account.attempt}</td><td className="py-3 font-mono text-xs">{account.correlationId ?? "—"}</td><td className="py-3">{account.recovery}</td>
          </tr>)}</tbody>
        </table>
      </div> : null}
      {attempts.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="pb-2 font-medium">Пользователь / номер</th>
                <th className="pb-2 font-medium">Назначение</th>
                <th className="pb-2 font-medium">Этап / состояние</th>
                <th className="pb-2 font-medium">Провайдер</th>
                <th className="pb-2 font-medium">HTTP / код</th>
                <th className="pb-2 font-medium">Попытки / retry</th>
                <th className="pb-2 font-medium">Проверка</th>
                <th className="pb-2 font-medium">Время</th>
                <th className="pb-2 font-medium">Correlation ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {attempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td className="py-3 text-zinc-700">
                    <span className="block font-medium text-zinc-950">{attempt.account ?? attempt.authUserId}</span>
                    <span className="block font-mono text-xs">{attempt.maskedTarget}</span>
                  </td>
                  <td className="py-3 text-zinc-700">{attempt.purpose}<span className="block text-xs text-zinc-500">{attempt.intent ?? "—"}</span></td>
                  <td className="py-3 text-zinc-700">{attempt.stage}<span className="block text-xs text-zinc-500">{attempt.deliveryState}</span></td>
                  <td className="py-3 text-zinc-700">{attempt.provider} · {attempt.transport}</td>
                  <td className="py-3 text-zinc-700">{attempt.providerHttpStatus ?? "—"} · {attempt.providerCode ?? attempt.safeErrorCode ?? "—"}</td>
                  <td className="py-3 text-zinc-700">{attempt.attemptCount} · {attempt.retryState}</td>
                  <td className="py-3 text-zinc-700">{attempt.verificationState}</td>
                  <td className="py-3 text-zinc-700">{attempt.requestedAt}<span className="block text-xs text-zinc-500">{attempt.providerTimestamp ?? "—"}</span></td>
                  <td className="py-3 font-mono text-xs text-zinc-700">{attempt.correlationId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-3 text-sm text-zinc-600">Попыток отправки пока нет.</p>}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="bg-white p-3"><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 text-xl font-semibold text-zinc-950">{value}</dd></div>;
}
