import { redirect } from "next/navigation";

import { runOneCHealthCheckAction } from "@/src/modules/integration/actions";
import type {
  OneCHealthCheck,
  OneCNameQueryHealth,
} from "@/src/modules/integration/providers/one-c/one-c-health-check";
import { ONE_C_DIAGNOSTIC_VERSION } from "@/src/modules/integration/providers/one-c/one-c-health-check";

export default async function OneCHealthPage() {
  const result = await runOneCHealthCheckAction();

  if (!result.success && result.errorCode === "AUTH_REQUIRED") {
    redirect("/auth/sign-in");
  }

  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "Not available";
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || "Not available";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">Integrations</p>
          <h1 className="mt-2 text-2xl font-semibold">1C OData connection diagnostics</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Internal diagnostic summary. Credentials, query values, response bodies, and counterparty data are never displayed.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Metric label="Diagnostic version" value={ONE_C_DIAGNOSTIC_VERSION} />
            <Metric label="Commit SHA" value={commitSha} />
            <Metric label="Deployment ID" value={deploymentId} />
          </div>
        </div>

        {!result.success ? (
          <section className="rounded-lg border border-red-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Diagnostics unavailable</h2>
            <p className="mt-2 text-sm text-slate-600">{result.message}</p>
          </section>
        ) : (
          <>
            <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <SectionTitle passed={result.data.configuration.checks.every((check) => check.configured)} title="Configuration" />
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Metric label="Base hostname" value={result.data.configuration.baseHost ?? "Not configured"} />
                <Metric label="Auth mode" value={result.data.configuration.authMode ?? "Not configured"} />
                <Metric label="Timeout" value={result.data.configuration.timeoutMs ? `${result.data.configuration.timeoutMs} ms` : "Invalid"} />
              </div>
              <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
                {result.data.configuration.checks.map((check) => (
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm last:border-0" key={check.variable}>
                    <span>{check.variable}</span>
                    <Status passed={check.configured} />
                  </div>
                ))}
              </div>
            </section>

            <CheckCard check={result.data.metadata} title="DNS / TLS / network" />
            <MinimalQueryCard check={result.data.minimalQuery} />
            <NameQueryCard check={result.data.nameQuery} />
            <ProviderCard provider={result.data.provider} />
          </>
        )}
      </div>
    </main>
  );
}

function CheckCard({ check, title }: { check: OneCHealthCheck; title: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <SectionTitle passed={check.passed} title={title} />
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Metric label="HTTP status" value={check.statusCode?.toString() ?? "No response"} />
        <Metric label="Content type" value={check.contentType ?? "Not available"} />
        <Metric label="Duration" value={check.durationMs !== null ? `${check.durationMs} ms` : "Not available"} />
        <Metric label="Hostname" value={check.hostname ?? "Not configured"} />
      </div>
      {check.errorCategory ? <ErrorSummary category={check.errorCategory} message={check.message} /> : null}
    </section>
  );
}

function MinimalQueryCard({ check }: { check: OneCHealthCheck & { jsonParsed: boolean; valueArray: boolean; rowCount: number } }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <SectionTitle passed={check.passed} title="Minimal OData query" />
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Metric label="HTTP status" value={check.statusCode?.toString() ?? "No response"} />
        <Metric label="Duration" value={check.durationMs !== null ? `${check.durationMs} ms` : "Not available"} />
        <Metric label="JSON parsed" value={String(check.jsonParsed)} />
        <Metric label="Value rows" value={check.valueArray ? String(check.rowCount) : "No value array"} />
      </div>
      {check.errorCategory ? <ErrorSummary category={check.errorCategory} message={check.message} /> : null}
    </section>
  );
}

function NameQueryCard({ check }: { check: OneCNameQueryHealth }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <SectionTitle passed={check.passed} title="Fixed name-search query" />
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Metric label="HTTP status" value={check.statusCode?.toString() ?? "No response"} />
        <Metric label="Duration" value={check.durationMs !== null ? `${check.durationMs} ms` : "Not available"} />
        <Metric label="Value rows" value={check.valueArray ? String(check.rowCount) : "No value array"} />
        <Metric label="Valid mapped rows" value={String(check.validMappedRowCount)} />
        <Metric label="Skipped rows" value={String(check.skippedRowCount)} />
      </div>
      {check.validationFailures.length > 0 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">Validation failures</p>
          <ul className="mt-2 space-y-1">
            {check.validationFailures.map((failure, index) => <li key={`${failure.field}-${index}`}>{failure.field}: {failure.receivedType}</li>)}
          </ul>
        </div>
      ) : null}
      {check.errorCategory ? <ErrorSummary category={check.errorCategory} message={check.message} /> : null}
    </section>
  );
}

function ProviderCard({ provider }: { provider: { passed: boolean; resultCount: number; providerOutputShape: string | null; providerOutputCount: number | null; serviceOutputShape: string | null; serviceOutputCount: number | null; failedStage: string | null; issuePaths: string[]; receivedContentType: string | null; requestKind: string | null; resourceName: string | null; queryParameterNames: string[]; statusCode: number | null; jsonParseFailure: boolean; parseErrorName: string | null; bodyLength: number | null; bomDetected: boolean; emptyBody: boolean; errorType: string | null; errorName: string | null; errorCategory: string | null; message: string } }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <SectionTitle passed={provider.passed} title="Provider-level test" />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Result count" value={String(provider.resultCount)} />
        <Metric label="Provider output" value={provider.providerOutputShape ? `${provider.providerOutputShape} (${provider.providerOutputCount ?? 0})` : "Not available"} />
        <Metric label="Service output" value={provider.serviceOutputShape ? `${provider.serviceOutputShape} (${provider.serviceOutputCount ?? 0})` : "Not available"} />
        <Metric label="Failed stage" value={provider.failedStage ?? "None"} />
        <Metric label="Received content type" value={provider.receivedContentType ?? "Not available"} />
        <Metric label="HTTP status" value={provider.statusCode?.toString() ?? "Not available"} />
        <Metric label="Request kind" value={provider.requestKind ?? "Not available"} />
        <Metric label="Resource" value={provider.resourceName ?? "Not available"} />
        <Metric label="Query parameter names" value={provider.queryParameterNames.join(", ") || "Not available"} />
        <Metric label="JSON parse failure" value={String(provider.jsonParseFailure)} />
        <Metric label="Parse error" value={provider.parseErrorName ?? "Not available"} />
        <Metric label="Body length" value={provider.bodyLength?.toString() ?? "Not available"} />
        <Metric label="UTF-8 BOM" value={String(provider.bomDetected)} />
        <Metric label="Empty body" value={String(provider.emptyBody)} />
        <Metric label="Error type" value={provider.errorType ?? "Not available"} />
        <Metric label="Error name" value={provider.errorName ?? "Not available"} />
        <Metric label="Error category" value={provider.errorCategory ?? "None"} />
        <Metric label="Result" value={provider.message} />
      </div>
      {provider.issuePaths.length > 0 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">Issue paths</p>
          <ul className="mt-2 space-y-1">{provider.issuePaths.map((path) => <li key={path}>{path}</li>)}</ul>
        </div>
      ) : null}
    </section>
  );
}

function SectionTitle({ passed, title }: { passed: boolean; title: string }) {
  return <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-semibold">{title}</h2><Status passed={passed} /></div>;
}

function Status({ passed }: { passed: boolean }) {
  return <span className={passed ? "rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800" : "rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-800"}>{passed ? "PASS" : "FAIL"}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-all text-sm font-semibold text-slate-950">{value}</p></div>;
}

function ErrorSummary({ category, message }: { category: string; message: string | null }) {
  return <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{category}: {message}</p>;
}
