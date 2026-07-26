import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

void main();

async function main(): Promise<void> {
  loadLocalEnvironment();

  const input = parseArguments(process.argv.slice(2));
  const expectedConfirmation = buildConfirmation(
    input.userId,
    input.email,
    input.expectedSalesAssignmentId,
  );

  if (input.confirmation !== expectedConfirmation) {
    throw new Error(`Confirmation mismatch. Required: ${expectedConfirmation}`);
  }

  const supabase = createClient(
    requireEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await supabase.rpc("transfer_initial_platform_admin", {
    p_user_id: input.userId,
    p_email: input.email,
    p_expected_sales_assignment_id: input.expectedSalesAssignmentId,
    p_confirmation: input.confirmation,
  });

  if (error) {
    throw new Error(`Platform administrator transfer failed: ${error.message}`);
  }

  const result = data as {
    assignmentId: string;
    previousAssignmentId: string;
    idempotent: boolean;
  };

  console.log("Platform administrator transfer completed.");
  console.log(`Assignment ID: ${result.assignmentId}`);
  console.log(`Previous assignment ID: ${result.previousAssignmentId}`);
  console.log(`Idempotent: ${result.idempotent}`);
}

export function buildConfirmation(
  userId: string,
  email: string,
  expectedSalesAssignmentId: string,
): string {
  return [
    "TRANSFER NOVOTECH ADMIN",
    userId.trim().toLowerCase(),
    email.trim().toLowerCase(),
    expectedSalesAssignmentId.trim().toLowerCase(),
  ].join(" ");
}

export function parseArguments(arguments_: string[]): {
  userId: string;
  email: string;
  expectedSalesAssignmentId: string;
  confirmation: string;
} {
  const values = new Map<string, string>();

  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (!name?.startsWith("--") || !value) {
      throw new Error(
        "Usage: npm run transfer:platform-admin -- --user-id <uuid> --email <email> --expected-sales-assignment-id <uuid> --confirm <exact phrase>",
      );
    }
    values.set(name.slice(2), value);
  }

  const userId = requireGuid(values.get("user-id"), "user ID");
  const email = values.get("email")?.trim().toLowerCase() ?? "";
  const expectedSalesAssignmentId = requireGuid(
    values.get("expected-sales-assignment-id"),
    "expected sales assignment ID",
  );
  const confirmation = values.get("confirm") ?? "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid exact email is required.");
  }
  if (values.size !== 4) {
    throw new Error(
      "Only --user-id, --email, --expected-sales-assignment-id, and --confirm are accepted.",
    );
  }

  return { userId, email, expectedSalesAssignmentId, confirmation };
}

function requireGuid(value: string | undefined, label: string): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (
    !GUID_PATTERN.test(normalized)
    || normalized === "00000000-0000-0000-0000-000000000000"
  ) {
    throw new Error(`A valid non-zero ${label} is required.`);
  }
  return normalized;
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
