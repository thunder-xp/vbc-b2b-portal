import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run the old and new canonical definitions against the same populated fixture
// in one rollback-only local transaction. Never accepts a remote connection.
const sources = [
  [2, "supabase/migrations/20260730113000_partner_workspace_operational_dashboard.sql"],
  [3, "supabase/migrations/20260803220000_concise_operational_dashboard.sql"],
  [7, "supabase/migrations/20260908191616_partner_dashboard_sales_yoy_trend.sql"],
];
function definition(source, version) {
  const match = source.match(new RegExp(
    `create (?:or replace )?function public\\.get_partner_workspace_dashboard_v${version}\\([\\s\\S]*?\\n\\$\\$;`,
  ));
  if (!match) throw new Error(`Missing v${version} definition`);
  return match[0].replace(/^create function/, "create or replace function");
}
const oldDefinitions = sources.map(([version, path]) => definition(readFileSync(path, "utf8"), version)).join("\n\n");
const migration = readFileSync("supabase/migrations/20261007212607_optimize_dashboard_aggregate_permission_resolution.sql", "utf8");
const newDefinitions = sources.map(([version]) => definition(migration, version)).join("\n\n");
let runtime = readFileSync("supabase/tests/dashboard_aggregate_permission_optimization_runtime.sql", "utf8");
runtime = runtime.replace("begin;", () => `begin;\n${oldDefinitions}`);
runtime = runtime.replace("set local role authenticated;", () => `
create temp table dashboard_expected (payload jsonb);
select set_config('request.jwt.claim.sub', 'da500000-0000-4000-8000-000000000001', true);
insert into dashboard_expected select public.get_partner_workspace_dashboard_v7('da500000-0000-4000-8000-000000000101');
${newDefinitions}
grant select on dashboard_expected to authenticated;
set local role authenticated;`);
runtime = runtime.replace("  repeated := public.get_partner_workspace_dashboard_v7(company_id);", `
  if dashboard <> (select payload from dashboard_expected) then
    raise exception 'Old/new populated Dashboard JSON differs.';
  end if;
  repeated := public.get_partner_workspace_dashboard_v7(company_id);`);
const container = process.env.DASHBOARD_RUNTIME_CONTAINER ?? "supabase_db_vbc-b2b-portal";
if (!/^supabase_db_[a-zA-Z0-9_-]+$/.test(container)) {
  throw new Error("Dashboard runtime validation requires a local Supabase Docker container.");
}
const result = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
  input: runtime,
  encoding: "utf8",
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) throw result.error;
process.exit(result.status ?? 1);
