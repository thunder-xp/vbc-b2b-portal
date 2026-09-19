import type { ClaimedCustomerProvisioningEvent, CustomerProvisioningResult } from "./types";

export interface FinalCustomerProvisioningRepository {
  claim(limit: number): Promise<ClaimedCustomerProvisioningEvent[]>;
  provision(event: ClaimedCustomerProvisioningEvent): Promise<CustomerProvisioningResult>;
  fail(event: ClaimedCustomerProvisioningEvent, safeErrorCode: string): Promise<boolean>;
}
