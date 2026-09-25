import "server-only";

import { hashCustomerIdentityKey } from "@/src/modules/customer-identity/hmac";

import { BusinessPhoneEnrollmentService } from "./enrollment.service";
import {
  SupabaseBusinessPhoneEnrollmentAuthGateway,
  SupabaseBusinessPhoneEnrollmentRepository,
  SupabaseBusinessProfilePhoneStateRepository,
} from "./enrollment.supabase";
import { BusinessProfilePhoneStateService } from "./profile-phone-state";

export function createBusinessPhoneEnrollmentService() {
  const auth = new SupabaseBusinessPhoneEnrollmentAuthGateway();
  return new BusinessPhoneEnrollmentService(
    new SupabaseBusinessPhoneEnrollmentRepository(),
    auth,
    (phone) => hashCustomerIdentityKey("PHONE", phone, true).keyHash,
  );
}

export function createBusinessProfilePhoneStateService() {
  return new BusinessProfilePhoneStateService(
    new SupabaseBusinessProfilePhoneStateRepository(),
    new SupabaseBusinessPhoneEnrollmentAuthGateway(),
  );
}
