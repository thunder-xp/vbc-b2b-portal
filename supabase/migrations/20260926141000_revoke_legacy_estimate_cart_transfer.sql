-- All Partner Estimate transfers now pass through the accepted-version guard.
-- The v3 security-definer function can still call v2 internally.

revoke all on function public.transfer_estimate_to_cart_v2(uuid, uuid, jsonb)
  from public, anon, authenticated;
