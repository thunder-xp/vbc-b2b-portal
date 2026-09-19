import { spawnSync } from "node:child_process";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const url = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
assertLocalAcceptanceUrl(url);

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const identities = [
  {
    id: "22000000-0000-4000-8000-000000000001",
    email: "test.agent.novotech@example.test",
    password: "TestAgent123!",
    displayName: "Test Agent Novotech",
  },
  {
    id: "22000000-0000-4000-8000-000000000002",
    email: "test.agent.onboarding@example.test",
    password: "TestAgent123!",
    displayName: "Test Agent Onboarding Novotech",
  },
  {
    id: "22000000-0000-4000-8000-000000000003",
    email: "test.customer.novotech@example.test",
    phone: "+37368000003",
    password: "TestCustomer123!",
    displayName: "Test Customer Novotech",
  },
];

for (const identity of identities) await ensureAuthPrincipal(identity);

const fixturePath = path.join("supabase", "tests", "customer_agent_cabinet_experience_fixture.sql");
const command = process.platform === "win32" ? "cmd.exe" : "npx";
const args = process.platform === "win32"
  ? ["/d", "/s", "/c", `npx supabase db query --local --file ${fixturePath}`]
  : ["supabase", "db", "query", "--local", "--file", fixturePath];
const result = spawnSync(command, args, {
  cwd: process.cwd(),
  encoding: "utf8",
  windowsHide: true,
  shell: false,
});
if (result.status !== 0) {
  throw new Error(
    `apply local Agent acceptance fixture failed: ${(result.error?.message || result.stderr || result.stdout || "unknown").trim()}`,
  );
}

const { data: agents, error: agentError } = await admin
  .from("commercial_agents")
  .select("id,user_id,status,compliance_status")
  .in("user_id", identities.map((identity) => identity.id));
if (agentError) fail("read local Agent fixtures", agentError);

const activeAgent = agents?.find((agent) => agent.user_id === identities[0].id);
if (!activeAgent) throw new Error("Active local Agent fixture was not created.");

const [referralsResult, attributionsResult, eventsResult] = await Promise.all([
  admin.from("agent_referrals").select("id", { count: "exact", head: true }).eq("agent_id", activeAgent.id),
  admin.from("agent_attributions").select("id", { count: "exact", head: true }).eq("agent_id", activeAgent.id),
  admin.from("agent_domain_events").select("id", { count: "exact", head: true }).eq("agent_id", activeAgent.id),
]);
if (referralsResult.error) fail("read local referral count", referralsResult.error);
if (attributionsResult.error) fail("read local attribution count", attributionsResult.error);
if (eventsResult.error) fail("read local event count", eventsResult.error);

console.log(JSON.stringify({
  environment: "LOCAL_ACCEPTANCE_ONLY",
  activeAgent: {
    userId: identities[0].id,
    email: identities[0].email,
    status: activeAgent.status,
    compliance: activeAgent.compliance_status,
  },
  onboardingAgent: {
    userId: identities[1].id,
    email: identities[1].email,
    status: agents?.find((agent) => agent.user_id === identities[1].id)?.status ?? null,
  },
  customerPrincipal: {
    userId: identities[2].id,
    email: identities[2].email,
    history: "CONTROLLED_PURCHASE_FIXTURE",
  },
  referralCount: referralsResult.count ?? 0,
  attributionCount: attributionsResult.count ?? 0,
  eventCount: eventsResult.count ?? 0,
  commissionRows: 0,
  productionMutation: false,
}));

async function ensureAuthPrincipal(identity) {
  const { data: existing, error: readError } = await admin.auth.admin.getUserById(identity.id);
  if (readError && readError.status !== 404) fail("read local Auth principal", readError);
  if (existing?.user) {
    const { error } = await admin.auth.admin.updateUserById(identity.id, {
      email: identity.email,
      phone: identity.phone,
      password: identity.password,
      email_confirm: true,
      phone_confirm: Boolean(identity.phone),
      user_metadata: { full_name: identity.displayName, test_fixture: true },
    });
    if (error) fail("refresh local Auth principal", error);
    return;
  }
  const { error } = await admin.auth.admin.createUser({
    id: identity.id,
    email: identity.email,
    phone: identity.phone,
    password: identity.password,
    email_confirm: true,
    phone_confirm: Boolean(identity.phone),
    user_metadata: { full_name: identity.displayName, test_fixture: true },
  });
  if (error) fail("create local Auth principal", error);
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required local acceptance variable: ${name}`);
  return value;
}

function assertLocalAcceptanceUrl(value) {
  const target = new URL(value);
  if (!new Set(["localhost", "127.0.0.1"]).has(target.hostname)) {
    throw new Error("Agent acceptance fixture is local-only; refusing a non-local Supabase URL.");
  }
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("Agent acceptance fixture must never run in production.");
  }
}

function fail(operation, error) {
  throw new Error(`${operation} failed: ${error?.code ?? error?.message ?? "unknown"}`);
}
