-- Inventory sync write policies and expected-stock fields for the inventory
-- read-model cache. 1C remains the source of truth.

ALTER TABLE public.product_stock_balances
  ADD COLUMN IF NOT EXISTS expected_quantity numeric(14, 3) null,
  ADD COLUMN IF NOT EXISTS expected_at timestamptz null;

COMMENT ON COLUMN public.product_stock_balances.expected_quantity IS
  'Optional cached expected incoming quantity from 1C. This is not a reservation or order commitment.';
COMMENT ON COLUMN public.product_stock_balances.expected_at IS
  'Optional cached expected arrival timestamp from 1C. This is not a delivery promise.';

CREATE OR REPLACE FUNCTION public.can_sync_inventory_read_model()
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

REVOKE ALL ON FUNCTION public.can_sync_inventory_read_model() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_sync_inventory_read_model() TO authenticated;

GRANT INSERT, UPDATE ON public.product_stock_balances TO authenticated;

CREATE POLICY "Internal users can insert product stock balances"
  ON public.product_stock_balances
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_sync_inventory_read_model());

CREATE POLICY "Internal users can update product stock balances"
  ON public.product_stock_balances
  FOR UPDATE
  TO authenticated
  USING (public.can_sync_inventory_read_model())
  WITH CHECK (public.can_sync_inventory_read_model());

COMMENT ON FUNCTION public.can_sync_inventory_read_model()
  IS 'Allows active internal/admin users to maintain cached stock balances imported from 1C. Does not grant partner stock visibility and does not use external_1c_id as a security boundary.';
