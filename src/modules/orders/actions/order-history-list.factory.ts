import {
  createCompanyAccessService,
  createPermissionService,
} from "../../access-control/actions/service-factory";
import {
  SupabasePartnerOrderHistoryRepository,
  SupabasePartnerOrderRepository,
} from "../repositories/supabase";
import { DefaultPartnerOrderHistoryService } from "../services";

export function createPartnerOrderHistoryListService(): DefaultPartnerOrderHistoryService {
  return new DefaultPartnerOrderHistoryService(
    new SupabasePartnerOrderHistoryRepository(),
    new SupabasePartnerOrderRepository(),
    createCompanyAccessService(),
    createPermissionService(),
  );
}
