"use client";

import { useState, useTransition } from "react";

import { runOneCHealthCheckAction } from "../actions";
import type {
  OneCConfigurationHealth,
  OneCHealthCheck,
  OneCHealthReport,
} from "../providers/one-c/one-c-health-check";

export function OneCHealthPanel({
  configuration,
  deployment,
}: {
  configuration: OneCConfigurationHealth;
  deployment: {
    diagnosticVersion: string;
    commitSha: string;
    deploymentId: string;
  };
}) {
  const [report, setReport] = useState<OneCHealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runDiagnostic() {
    setError(null);
    startTransition(async () => {
      const result = await runOneCHealthCheckAction();
      if (!result.success) {
        setReport(null);
        setError(result.message);
        return;
      }
      setReport(result.data);
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Версия диагностики" value={deployment.diagnosticVersion} />
          <Metric label="Commit SHA" value={deployment.commitSha} />
          <Metric label="Deployment ID" value={deployment.deploymentId} />
        </div>
      </section>

      <ConfigurationCard configuration={configuration} />

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-zinc-950">Live-диагностика</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Сетевые проверки и запрос к провайдеру выполняются только после
              подтверждения.
            </p>
          </div>
          <button
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            onClick={runDiagnostic}
            type="button"
          >
            {isPending ? "Проверка..." : "Запустить диагностику"}
          </button>
        </div>
        {error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}
      </section>

      {report ? <DiagnosticReport report={report} /> : null}
    </div>
  );
}

function ConfigurationCard({
  configuration,
}: {
  configuration: OneCConfigurationHealth;
}) {
  const passed = configuration.checks.every((check) => check.configured);
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5">
      <SectionTitle passed={passed} title="Локальная конфигурация" />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric
          label="Хост"
          value={configuration.baseHost ?? "Не настроен"}
        />
        <Metric
          label="Режим авторизации"
          value={configuration.authMode ?? "Не настроен"}
        />
        <Metric
          label="Тайм-аут"
          value={
            configuration.timeoutMs
              ? `${configuration.timeoutMs} ms`
              : "Некорректный"
          }
        />
      </div>
      <div className="mt-4 overflow-hidden rounded-md border border-zinc-200">
        {configuration.checks.map((check) => (
          <div
            className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 text-sm last:border-0"
            key={check.variable}
          >
            <span>{check.variable}</span>
            <Status passed={check.configured} />
          </div>
        ))}
      </div>
    </section>
  );
}

function DiagnosticReport({ report }: { report: OneCHealthReport }) {
  return (
    <div className="space-y-5" data-testid="one-c-live-diagnostic-result">
      <CheckCard check={report.metadata} title="DNS / TLS / сеть" />
      <CheckCard check={report.minimalQuery} title="Минимальный OData-запрос" />
      <CheckCard check={report.nameQuery} title="Поиск контрагента" />
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <SectionTitle
          passed={report.provider.passed}
          title="Проверка провайдера"
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric
            label="Результатов"
            value={String(report.provider.resultCount)}
          />
          <Metric
            label="Этап ошибки"
            value={report.provider.failedStage ?? "Нет"}
          />
          <Metric
            label="HTTP"
            value={report.provider.statusCode?.toString() ?? "Нет ответа"}
          />
          <Metric
            label="Тип ответа"
            value={report.provider.receivedContentType ?? "Нет данных"}
          />
          <Metric
            label="Категория"
            value={report.provider.errorCategory ?? "Нет"}
          />
          <Metric label="Итог" value={report.provider.message} />
        </div>
      </section>
    </div>
  );
}

function CheckCard({
  check,
  title,
}: {
  check: OneCHealthCheck;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5">
      <SectionTitle passed={check.passed} title={title} />
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Metric
          label="HTTP"
          value={check.statusCode?.toString() ?? "Нет ответа"}
        />
        <Metric label="Content-Type" value={check.contentType ?? "Нет данных"} />
        <Metric
          label="Длительность"
          value={check.durationMs === null ? "Нет данных" : `${check.durationMs} ms`}
        />
        <Metric label="Хост" value={check.hostname ?? "Не настроен"} />
      </div>
      {check.errorCategory ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {check.errorCategory}: {check.message}
        </p>
      ) : null}
    </section>
  );
}

function SectionTitle({
  passed,
  title,
}: {
  passed: boolean;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="font-semibold text-zinc-950">{title}</h2>
      <Status passed={passed} />
    </div>
  );
}

function Status({ passed }: { passed: boolean }) {
  return (
    <span
      className={
        passed
          ? "rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800"
          : "rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-800"
      }
    >
      {passed ? "PASS" : "FAIL"}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-xs font-medium uppercase text-zinc-500">{label}</p>
      <p className="mt-1 break-all text-sm font-semibold text-zinc-950">
        {value}
      </p>
    </div>
  );
}
