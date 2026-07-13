import { createCompanyAccessService } from "../../access-control/actions/service-factory";
import { SupabaseRolePermissionRepository } from "../../access-control/repositories/supabase";
import { DefaultPermissionService } from "../../access-control/services/implementations";
import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { DefaultCatalogService } from "../../catalog/services";
import { OneCProvider } from "../../integration/providers/one-c";
import { getOneCEnv } from "../../../lib/env";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import { SupabaseCartRepository, SupabasePartnerOrderRepository } from "../repositories/supabase";
import { DefaultCartService, DefaultPartnerOrderService } from "../services";

function dependencies() {
  const companyAccessService = createCompanyAccessService();
  const permissionService = new DefaultPermissionService(new SupabaseRolePermissionRepository());
  const pricingInventoryService = createPricingInventoryService();
  const cartRepository = new SupabaseCartRepository();
  const orderRepository = new SupabasePartnerOrderRepository();
  const catalogService = new DefaultCatalogService(new SupabaseCatalogRepository(), companyAccessService);
  return { companyAccessService, permissionService, pricingInventoryService, cartRepository, orderRepository, catalogService };
}

export function createCartService(): DefaultCartService {
  const value = dependencies();
  return new DefaultCartService(value.cartRepository, value.companyAccessService, value.permissionService, value.catalogService, value.pricingInventoryService);
}

export function createPartnerOrderService(): DefaultPartnerOrderService {
  const value = dependencies();
  const env = getOneCEnv();
  const provider = new OneCProvider({
    baseUrl: env.baseUrl,
    username: env.username,
    password: env.password,
    requestTimeoutMs: env.requestTimeoutMs,
    useMockPartners: false,
  });
  return new DefaultPartnerOrderService(
    value.cartRepository, value.orderRepository, value.companyAccessService, value.permissionService,
    value.catalogService, value.pricingInventoryService, provider.partners, provider.orders,
  );
}
