import "server-only";

import { hashCustomerIdentityKey } from "@/src/modules/customer-identity/hmac";

import { BusinessPhoneEnrollmentService } from "./enrollment.service";
import { SupabaseBusinessPhoneEnrollmentAuthGateway, SupabaseBusinessPhoneEnrollmentRepository } from "./enrollment.supabase";

export function createBusinessPhoneEnrollmentService() {
  return new BusinessPhoneEnrollmentService(
    new SupabaseBusinessPhoneEnrollmentRepository(),
    new SupabaseBusinessPhoneEnrollmentAuthGateway(),
    (phone) => hashCustomerIdentityKey("PHONE", phone, true).keyHash,
  );
}
