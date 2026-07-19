import { createCompanyAccessService, createPermissionService } from "../../access-control/actions/service-factory";
import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { DefaultCatalogService } from "../../catalog/services";
import { OneCProvider } from "../../integration/providers/one-c";
import { getOneCEnv } from "../../../lib/env";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import { SupabaseCartRepository, SupabaseOrderDateChangeRequestRepository, SupabasePartnerOrderHistoryRepository, SupabasePartnerOrderRepository } from "../repositories/supabase";
import { DefaultCartService, DefaultPartnerOrderHistoryService, DefaultPartnerOrderService, PartnerOrderHistoryAutomationService } from "../services";

function dependencies() {
  const companyAccessService = createCompanyAccessService();
  const permissionService = createPermissionService();
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
    useLegacyMinimalOrderPayload: env.useLegacyMinimalOrderPayload === true,
  });
  return new DefaultPartnerOrderService(
    value.cartRepository, value.orderRepository, value.companyAccessService, value.permissionService,
    value.catalogService, value.pricingInventoryService, provider.partners, provider.orders,
    { useLegacyMinimalOrderPayload: env.useLegacyMinimalOrderPayload === true },
  );
}

export function createPartnerOrderHistoryService(): DefaultPartnerOrderHistoryService {
  const value = dependencies();
  const orderProvider = createPartnerOrderHistoryProvider();
  return new DefaultPartnerOrderHistoryService(
    new SupabasePartnerOrderHistoryRepository(),
    value.orderRepository,
    value.companyAccessService,
    value.permissionService,
    orderProvider,
    new SupabaseOrderDateChangeRequestRepository(),
  );
}

export function createPartnerOrderHistoryAutomationService(): PartnerOrderHistoryAutomationService {
  const repository = new SupabasePartnerOrderHistoryRepository();
  return new PartnerOrderHistoryAutomationService(
    repository,
    createPartnerOrderHistoryProvider(),
    createPartnerOrderHistoryService(),
  );
}

export function createPartnerOrderHistoryProvider() {
  const env = getOneCEnv();
  const provider = new OneCProvider({
    baseUrl: env.baseUrl,
    username: env.username,
    password: env.password,
    requestTimeoutMs: env.requestTimeoutMs,
    useMockPartners: false,
  });
  return provider.orders;
}
