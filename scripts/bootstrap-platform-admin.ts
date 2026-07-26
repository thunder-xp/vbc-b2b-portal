import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

loadLocalEnvironment();

const input = parseArguments(process.argv.slice(2));
const expectedConfirmation = buildConfirmation(input.userId, input.email);

if (input.confirmation !== expectedConfirmation) {
  throw new Error(`Confirmation mismatch. Required: ${expectedConfirmation}`);
}

const supabaseUrl = requireEnvironment("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.rpc("bootstrap_platform_admin", {
  p_user_id: input.userId,
  p_email: input.email,
  p_confirmation: input.confirmation,
});

if (error) {
  throw new Error(`Platform administrator bootstrap failed: ${error.message}`);
}

console.log("Platform administrator bootstrap completed.");
console.log(`Assignment ID: ${String(data)}`);

export function buildConfirmation(userId: string, email: string): string {
  return `BOOTSTRAP NOVOTECH ADMIN ${userId.toLowerCase()} ${email.trim().toLowerCase()}`;
}

export function parseArguments(arguments_: string[]): {
  userId: string;
  email: string;
  confirmation: string;
} {
  const values = new Map<string, string>();

  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (!name?.startsWith("--") || !value) {
      throw new Error(
        "Usage: npm run bootstrap:platform-admin -- --user-id <uuid> --email <email> --confirm <exact phrase>",
      );
    }
    values.set(name.slice(2), value);
  }

  const userId = values.get("user-id")?.trim().toLowerCase() ?? "";
  const email = values.get("email")?.trim().toLowerCase() ?? "";
  const confirmation = values.get("confirm") ?? "";

  if (!GUID_PATTERN.test(userId) || userId === "00000000-0000-0000-0000-000000000000") {
    throw new Error("A valid non-zero user ID is required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid exact email is required.");
  }
  if (values.size !== 3) {
    throw new Error("Only --user-id, --email, and --confirm are accepted.");
  }

  return { userId, email, confirmation };
}

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function loadLocalEnvironment(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (existsSync(path)) process.loadEnvFile(path);
}
