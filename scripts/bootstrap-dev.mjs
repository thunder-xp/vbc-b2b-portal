import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const DEV_MANAGER_EMAIL = "manager@novotech.local";
const DEV_MANAGER_PASSWORD = "Manager123!";
const INTERNAL_MANAGER_ROLE_CODE = "internal_manager";
const CAN_APPROVE_PARTNER_PERMISSION = "CanApprovePartner";

loadEnvLocal();
assertDevelopmentOnly();

const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const authUser = await ensureAuthUser();
await ensureUserProfile(authUser.id);
const role = await ensureRole();
const permission = await ensurePermission();
await ensureRolePermission(role.id, permission.id);

console.log("Development internal manager bootstrap complete.");
console.log(`Email: ${DEV_MANAGER_EMAIL}`);
console.log("Password: Manager123!");

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    process.env[key] ??= value;
  }
}

function assertDevelopmentOnly() {
  if (process.env.NODE_ENV && process.env.NODE_ENV !== "development") {
    throw new Error("bootstrap:dev can only run with NODE_ENV=development.");
  }

  if (process.env.VERCEL_ENV === "production") {
    throw new Error("bootstrap:dev must never run in production.");
  }
}

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function ensureAuthUser() {
  const existing = await findAuthUserByEmail(DEV_MANAGER_EMAIL);

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: DEV_MANAGER_EMAIL,
    password: DEV_MANAGER_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: "Novotech Internal Manager",
    },
  });

  if (error || !data.user) {
    throw new Error(`Failed to create manager auth user: ${error?.message}`);
  }

  return data.user;
}

async function findAuthUserByEmail(email) {
  let page = 1;

  while (page < 50) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    const user = data.users.find(
      (item) => item.email?.toLowerCase() === email.toLowerCase(),
    );

    if (user) {
      return user;
    }

    if (data.users.length < 100) {
      return null;
    }

    page += 1;
  }

  throw new Error("Auth user lookup exceeded safe pagination limit.");
}

async function ensureUserProfile(userId) {
  const payload = {
    id: userId,
    email: DEV_MANAGER_EMAIL,
    full_name: "Novotech Internal Manager",
    phone: null,
    status: "active",
    user_type: "internal",
  };
  const { error } = await supabase
    .from("user_profiles")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    throw new Error(`Failed to upsert manager profile: ${error.message}`);
  }
}

async function ensureRole() {
  const { data, error } = await supabase
    .from("roles")
    .upsert(
      {
        code: INTERNAL_MANAGER_ROLE_CODE,
        name: "Internal Manager",
        scope: "internal",
      },
      { onConflict: "code" },
    )
    .select("id, code")
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert internal manager role: ${error?.message}`);
  }

  return data;
}

async function ensurePermission() {
  const { data, error } = await supabase
    .from("permissions")
    .upsert(
      {
        code: CAN_APPROVE_PARTNER_PERMISSION,
        description: "Approve partner access requests.",
      },
      { onConflict: "code" },
    )
    .select("id, code")
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert approval permission: ${error?.message}`);
  }

  return data;
}

async function ensureRolePermission(roleId, permissionId) {
  const { error } = await supabase
    .from("role_permissions")
    .upsert(
      {
        role_id: roleId,
        permission_id: permissionId,
      },
      { onConflict: "role_id,permission_id" },
    );

  if (error) {
    throw new Error(`Failed to assign permission to role: ${error.message}`);
  }
}
