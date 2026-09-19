function enabledUnlessExplicitlyDisabled(value: string | undefined) {
  return value?.trim().toLowerCase() !== "false";
}
export function isUnifiedAuthCenterEnabled() {
  return enabledUnlessExplicitlyDisabled(process.env.UNIFIED_AUTH_CENTER_ENABLED);
}

export function isUnifiedBusinessRoutingEnabled() {
  return enabledUnlessExplicitlyDisabled(process.env.UNIFIED_BUSINESS_ROUTING_ENABLED);
}

export function isCustomerAccessResolverEnabled() {
  return enabledUnlessExplicitlyDisabled(process.env.CUSTOMER_ACCESS_RESOLVER_ENABLED);
}
