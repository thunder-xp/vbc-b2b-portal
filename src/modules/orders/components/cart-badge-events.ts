export const CART_UPDATED_EVENT = "novotech:cart-updated";

export function notifyAuthoritativeCartCount(totalUnitCount: number): void {
  if (!Number.isFinite(totalUnitCount) || totalUnitCount < 0) return;
  window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT, {
    detail: { totalUnitCount: Math.trunc(totalUnitCount) },
  }));
}
