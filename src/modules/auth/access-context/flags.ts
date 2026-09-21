function enabledUnlessExplicitlyDisabled(value: string | undefined) {
  return value?.trim().toLowerCase() !== "false";
}
export function isUnifiedAuthCenterEnabled() {
  return enabledUnlessExplicitlyDisabled(process.env.UNIFIED_AUTH_CENTER_ENABLED);
}

export function isCustomerAccessResolverEnabled() {
  return enabledUnlessExplicitlyDisabled(process.env.CUSTOMER_ACCESS_RESOLVER_ENABLED);
}

export function isCustomerPurchaseEntitlementEnforced() {
  return enabledUnlessExplicitlyDisabled(process.env.CUSTOMER_PURCHASE_ENTITLEMENT_ENFORCED);
}
