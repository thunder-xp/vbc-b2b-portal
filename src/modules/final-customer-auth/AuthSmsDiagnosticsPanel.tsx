import type { AuthSmsDiagnostic } from "./auth-sms-diagnostics.repository";

export function AuthSmsDiagnosticsPanel({ attempts }: { attempts: readonly AuthSmsDiagnostic[] }) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-5" aria-labelledby="auth-sms-diagnostics-title">
      <div>
        <h2 className="font-semibold text-zinc-950" id="auth-sms-diagnostics-title">SMS-подтверждение телефона</h2>
        <p className="mt-1 text-sm text-zinc-600">Безопасная диагностика отправки и проверки OTP. Код OTP не сохраняется и не отображается.</p>
      </div>
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
