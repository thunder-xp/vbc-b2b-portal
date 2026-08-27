export function partnerOrderRedirectTo(orderId: string): string {
  return `/cabinet/orders/${orderId}?submitted=1`;
}
