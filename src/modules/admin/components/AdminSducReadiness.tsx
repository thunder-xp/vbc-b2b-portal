import type { AdminSducReadiness as Readiness } from "../types";

export function AdminSducReadinessView({ readiness }: { readiness: Readiness }) {
  const calibration = readiness.calibration;
  const metrics = [
    ["Компании", calibration.companyCount ?? 0],
    ["Товары", calibration.productCount ?? 0],
    ["Пары с резервом", calibration.positiveReserve ?? 0],
    ["Без базовой цены", calibration.missingBase ?? 0],
    ["Без STOP", calibration.missingStop ?? 0],
    ["Несопоставимая валюта", calibration.currencyMismatch ?? 0],
    ["Поддерживает ≥0,5%", calibration.support?.gte0_5 ?? 0],
    ["Поддерживает ≥1%", calibration.support?.gte1 ?? 0],
    ["Поддерживает ≥2%", calibration.support?.gte2 ?? 0],
  ] as const;

  return (
    <section className="space-y-4 border-t border-zinc-200 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">
            SDUC — готовность снижения цены
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Диагностика покрытия без активации скидок и без изменения действующих цен.
          </p>
        </div>
        <span className="border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
          DRY RUN · НЕ АКТИВНО
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(([label, value]) => (
          <article className="border border-zinc-200 bg-white p-4" key={label}>
            <p className="text-xs uppercase text-zinc-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950">{value}</p>
          </article>
        ))}
      </div>

      <p className="text-sm text-zinc-600">
        Источник STOP: {readiness.stopAuthorityStatus}. Включённых механизмов:{" "}
        {readiness.enabledMechanismCount}. Активных авторизаций:{" "}
        {readiness.activeAuthorizationCount}.
      </p>
    </section>
  );
}
