import {
  createCompanyAccessService,
  createPermissionService,
} from "../../access-control/actions/service-factory";
import { SupabasePartnerOrderHistoryRepository } from "../repositories/supabase/order-history.supabase-repository";
import { SupabasePartnerOrderRepository } from "../repositories/supabase/order.supabase-repository";
import { DefaultPartnerOrderHistoryService } from "../services/order-history.service";

export function createPartnerOrderHistoryListService(): DefaultPartnerOrderHistoryService {
  return new DefaultPartnerOrderHistoryService(
    new SupabasePartnerOrderHistoryRepository(),
    new SupabasePartnerOrderRepository(),
    createCompanyAccessService(),
    createPermissionService(),
  );
}
