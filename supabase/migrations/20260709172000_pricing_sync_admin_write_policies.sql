-- Pricing sync write policies for the pricing read-model cache.
-- 1C remains the source of truth. These policies allow approved internal
-- Novotech users to update cached product prices without using Service Role.

CREATE OR REPLACE FUNCTION public.can_sync_pricing_read_model()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles user_profile
    WHERE user_profile.id = auth.uid()
      AND user_profile.status = 'active'
      AND user_profile.user_type IN ('internal', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.can_sync_pricing_read_model() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_sync_pricing_read_model() TO authenticated;

GRANT INSERT, UPDATE ON public.product_prices TO authenticated;

CREATE POLICY "Internal users can insert product prices"
  ON public.product_prices
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_sync_pricing_read_model());

CREATE POLICY "Internal users can update product prices"
  ON public.product_prices
  FOR UPDATE
  TO authenticated
  USING (public.can_sync_pricing_read_model())
  WITH CHECK (public.can_sync_pricing_read_model());

COMMENT ON FUNCTION public.can_sync_pricing_read_model()
  IS 'Allows active internal/admin users to maintain cached product prices imported from 1C. Does not grant price visibility to partners and does not use external_1c_id as a security boundary.';
