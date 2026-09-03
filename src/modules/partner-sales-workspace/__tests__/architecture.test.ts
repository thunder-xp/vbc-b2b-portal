import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repository = readFileSync(resolve("src/modules/partner-sales-workspace/supabase.repository.ts"), "utf8");
const service = readFileSync(resolve("src/modules/partner-sales-workspace/service.ts"), "utf8");
const dashboard = readFileSync(resolve("src/modules/partner-cabinet/components/OperationalDashboard.tsx"), "utf8");
const copy = readFileSync(resolve("src/modules/partner-locale/copy.ts"), "utf8");
const workspace = readFileSync(resolve("src/modules/partner-cabinet/services/workspace-home.service.ts"), "utf8");
const capabilities = readFileSync(resolve("src/modules/partner-cabinet/services/workspace-capability.service.ts"), "utf8");
const estimateWorkflow = readFileSync(resolve("src/modules/estimates/components/EstimateWorkflowPanel.tsx"), "utf8");
const estimateCopy = readFileSync(resolve("src/modules/partner-locale/estimates-copy.ts"), "utf8");
const conversionMigration = readFileSync(resolve("supabase/migrations/20260716190000_estimate_versions_workflow.sql"), "utf8");
const versionIdempotencyMigration = readFileSync(resolve("supabase/migrations/20260903093000_estimate_cart_version_idempotency.sql"), "utf8");
const lifecycleMigration = readFileSync(resolve("supabase/migrations/20260809007000_estimate_business_lifecycle.sql"), "utf8");

describe("estimate sales workspace boundaries", () => {
  it("uses one bounded Estimate read plus one parallel user-cart snapshot with no N+1 or browser Supabase access", () => {
    expect(repository).toContain('import "server-only"');
    expect(repository).toContain('.eq("company_id", companyId)');
    expect(repository).toContain('.neq("estimate.status", "archived")');
    expect(repository).toContain(".limit(");
    expect(repository.match(/\.from\(/g)).toHaveLength(2);
    expect(repository).toContain("await Promise.all([");
    expect(repository).toContain("product_requirements:snapshot->items");
    expect(repository).toContain("estimate_proposal_deliveries!estimate_proposal_deliveries_version_id_fkey");
    expect(repository).toContain('.limit(1, { referencedTable: "deliveries" })');
    expect(repository).toContain("estimate_cart_conversions!estimate_cart_conversions_estimate_id_fkey");
    expect(repository).toContain('.from("carts")');
    expect(repository).toContain('.eq("created_by", userId)');
    expect(repository).toContain("cart_items!cart_items_cart_id_fkey");
    expect(dashboard).not.toMatch(/supabase|createClient/);
    expect(workspace).toContain("context.capabilities.canViewEstimates");
    expect(workspace).toContain("context.capabilities.canSendProposal");
    expect(workspace).toContain("context.capabilities.canConvertEstimates");
    expect(workspace).toContain("context.capabilities.productCard.canAddToOrder");
    expect(capabilities).toContain('canViewEstimates: hasPermission("estimates.view")');
    expect(capabilities).toContain('canSendProposal: hasPermission("proposal.send")');
    expect(capabilities).toContain('canConvertEstimates: hasPermission("estimates.convert_to_cart")');
  });

  it("keeps one direct governed route, a non-mutating Dashboard action, and full RU/RO sales copy", () => {
    expect(dashboard).toContain('href={item.href}');
    expect(dashboard).toContain('eventName="dashboard_continue_work_clicked"');
    expect(dashboard).not.toMatch(/addEstimateEquipmentToCartAction|mergeEstimateProducts/);
    expect(dashboard).not.toMatch(/sendProposalDeliveryAction|createDraftFromEstimateVersionAction/);
    expect(service).toContain('if (type === "resume_checkout") return "/cabinet/cart"');
    expect(service).toContain('conversion.createdBy !== userId');
    expect(service).toContain('cart.createdBy !== userId');
    expect(service).toContain('cart.companyId !== companyId');
    expect(service).toContain('cart.status !== "active"');
    expect(service).toContain('followUpState === "expired_sent" ? "update"');
    expect(service).toContain('action === "resend"');
    expect(service).toContain("cartQuantities.get(productId)");
    expect(copy).toContain('"dashboard.proposalInCart"');
    expect(copy).toContain('"dashboard.resumeCheckout"');
    expect(estimateWorkflow).toContain('id="estimate-order-conversion"');
    for (const value of ["КП готово к отправке", "Ожидается решение клиента", "КП принято клиентом", "Продолжить оформление", "Oferta este gata de trimis", "Se așteaptă decizia clientului", "Oferta a fost acceptată de client", "Continuă perfectarea"]) expect(copy).toContain(value);
    for (const value of ["Подготовка корзины к заказу", "Pregătirea coșului pentru comandă"]) expect(estimateCopy).toContain(value);
  });

  it("reuses immutable-version cart idempotency and confirmed-order lifecycle truth", () => {
    expect(conversionMigration).toContain("unique (company_id, request_key)");
    expect(conversionMigration).toContain("prior.version_id is distinct from target_version_id");
    expect(conversionMigration).toContain("where source_version.id = target_version_id");
    expect(conversionMigration).toContain("public.can_access_estimates(target_company_id, 'estimates.convert_to_cart')");
    expect(conversionMigration).toContain("public.can_manage_partner_order_company(target_company_id)");
    expect(versionIdempotencyMigration).toContain("from public.estimate_versions version");
    expect(versionIdempotencyMigration).toContain("for update");
    expect(versionIdempotencyMigration).toContain("conversion.version_id = target_version_id");
    expect(versionIdempotencyMigration).toContain("conversion.created_at, conversion.id");
    expect(versionIdempotencyMigration).toContain("prior.created_by <> auth.uid()");
    expect(versionIdempotencyMigration).toContain("return prior.cart_id");
    expect(lifecycleMigration).toContain("estimate.accepted_version_id = version.id");
    expect(lifecycleMigration).toContain("estimate.lifecycle_status = 'accepted'");
    expect(lifecycleMigration).toContain("'converted_to_order'");
  });
});
