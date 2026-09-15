import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { canonicalMoldovaE164 } from "@/src/modules/final-customer-auth/auth-phone";

import { CUSTOMER_SERVICE_SMS_EVENTS, type CustomerServiceSmsEvent } from "./notification-policy";

export type CustomerServiceSmsRecipientContext = Readonly<{
  requestId: string;
  eventId: string;
  eventCode: CustomerServiceSmsEvent;
  customerAccountId: string;
  authUserId: string;
  verifiedPhone: string;
  locale: "ru" | "ro";
}>;

export interface CustomerServiceSmsRecipientRepository {
  findByEvent(eventId: string): Promise<CustomerServiceSmsRecipientContext | null>;
}

const contextSchema = z.object({
  requestId: z.string().uuid(),
  eventId: z.string().uuid(),
  eventCode: z.enum(CUSTOMER_SERVICE_SMS_EVENTS),
  customerAccountId: z.string().uuid(),
  authUserId: z.string().uuid(),
  verifiedPhone: z.string(),
  locale: z.enum(["ru", "ro"]),
});

export class SupabaseCustomerServiceSmsRecipientRepository
implements CustomerServiceSmsRecipientRepository {
  async findByEvent(eventId: string): Promise<CustomerServiceSmsRecipientContext | null> {
    const { data, error } = await createAdminClient().rpc(
      "get_customer_service_sms_recipient_context",
      { p_source_event_id: eventId },
    );
    if (error) throw new Error(`Customer Service SMS recipient lookup failed: ${error.code}`);
    if (!data) return null;
    const parsed = contextSchema.safeParse(data);
    if (!parsed.success) throw new Error("Customer Service SMS recipient lookup returned invalid data.");
    const verifiedPhone = canonicalMoldovaE164(parsed.data.verifiedPhone);
    if (!verifiedPhone) return null;
    return Object.freeze({ ...parsed.data, verifiedPhone });
  }
}
