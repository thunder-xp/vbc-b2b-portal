export function isNewPurchaseProvisioningEnabled() {
  return process.env.NEW_PURCHASE_PROVISIONING_ENABLED?.trim().toLowerCase() !== "false";
}
