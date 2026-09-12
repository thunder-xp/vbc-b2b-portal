import "server-only";

import { z } from "zod";

import { createClient } from "@/src/lib/supabase/server";

import type {
  MoldcellSmsHealthRepository,
  MoldcellSmsStoredHealth,
} from "../gateway/moldcell-sandbox.service";
import { NotificationRepositoryError } from "./supabase-notification.repository";

const healthSchema = z.object({
  lastSandboxSuccess: z.string().nullable(),
  lastFailure: z.string().nullable(),
  p50LatencyMs: z.number().nonnegative().nullable(),
  p95LatencyMs: z.number().nonnegative().nullable(),
  acceptedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  recipientLimitPerHour: z.number().int().positive(),
  companyLimitPerHour: z.number().int().positive(),
});

export class SupabaseMoldcellSmsHealthRepository implements MoldcellSmsHealthRepository {
  async getHealth(): Promise<MoldcellSmsStoredHealth> {
    const client = await createClient();
    const { data, error } = await client.rpc("get_admin_moldcell_sms_health");
    const parsed = healthSchema.safeParse(data);
    if (error || !parsed.success) throw new NotificationRepositoryError(error?.code);
    return parsed.data;
  }
}
