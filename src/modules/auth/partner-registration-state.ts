import "server-only";

import { z } from "zod";

import { getSupabaseAdminEnv } from "@/src/lib/env";

export type PartnerRegistrationIdentityState = "MISSING" | "UNCONFIRMED" | "CONFIRMED";

const usersResponseSchema = z.object({
  users: z.array(z.object({
    email: z.string().nullable().optional(),
    email_confirmed_at: z.string().nullable().optional(),
  }).passthrough()),
});

export class PartnerRegistrationStateError extends Error {
  constructor() {
    super("Partner registration identity state is temporarily unavailable.");
    this.name = "PartnerRegistrationStateError";
  }
}

export async function resolvePartnerRegistrationIdentityState(
  email: string,
  options: Readonly<{
    fetcher?: typeof fetch;
    environment?: Readonly<Record<string, string | undefined>>;
  }> = {},
): Promise<PartnerRegistrationIdentityState> {
  const normalized = email.trim().toLowerCase();
  const environment = options.environment ?? process.env;
  const config = environment === process.env
    ? getSupabaseAdminEnv()
    : { url: environment.NEXT_PUBLIC_SUPABASE_URL ?? "", serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY ?? "" };
  if (!config.url || !config.serviceRoleKey) throw new PartnerRegistrationStateError();

  let endpoint: URL;
  try {
    endpoint = new URL("/auth/v1/admin/users", config.url);
  } catch {
    throw new PartnerRegistrationStateError();
  }
  endpoint.searchParams.set("filter", normalized);
  endpoint.searchParams.set("page", "1");
  endpoint.searchParams.set("per_page", "100");

  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(endpoint, {
      method: "GET",
      headers: {
        apikey: config.serviceRoleKey,
        authorization: `Bearer ${config.serviceRoleKey}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    throw new PartnerRegistrationStateError();
  }
  if (!response.ok) throw new PartnerRegistrationStateError();

  const parsed = usersResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new PartnerRegistrationStateError();
  const existing = parsed.data.users.find((user) => user.email?.trim().toLowerCase() === normalized);
  if (!existing) return "MISSING";
  return existing.email_confirmed_at ? "CONFIRMED" : "UNCONFIRMED";
}
