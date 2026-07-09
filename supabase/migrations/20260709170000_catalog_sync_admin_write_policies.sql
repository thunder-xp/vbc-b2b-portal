-- Catalog sync write policies for the read-model cache.
-- 1C remains the source of truth. These policies allow approved internal
-- Novotech users to update the portal catalog cache without using Service Role.

CREATE OR REPLACE FUNCTION public.can_sync_catalog_read_model()
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

REVOKE ALL ON FUNCTION public.can_sync_catalog_read_model() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_sync_catalog_read_model() TO authenticated;

GRANT INSERT, UPDATE ON public.catalog_categories TO authenticated;
GRANT INSERT, UPDATE ON public.catalog_brands TO authenticated;
GRANT INSERT, UPDATE ON public.catalog_products TO authenticated;

CREATE POLICY "Internal users can insert catalog categories"
  ON public.catalog_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_sync_catalog_read_model());

CREATE POLICY "Internal users can update catalog categories"
  ON public.catalog_categories
  FOR UPDATE
  TO authenticated
  USING (public.can_sync_catalog_read_model())
  WITH CHECK (public.can_sync_catalog_read_model());

CREATE POLICY "Internal users can insert catalog brands"
  ON public.catalog_brands
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_sync_catalog_read_model());

CREATE POLICY "Internal users can update catalog brands"
  ON public.catalog_brands
  FOR UPDATE
  TO authenticated
  USING (public.can_sync_catalog_read_model())
  WITH CHECK (public.can_sync_catalog_read_model());

CREATE POLICY "Internal users can insert catalog products"
  ON public.catalog_products
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_sync_catalog_read_model());

CREATE POLICY "Internal users can update catalog products"
  ON public.catalog_products
  FOR UPDATE
  TO authenticated
  USING (public.can_sync_catalog_read_model())
  WITH CHECK (public.can_sync_catalog_read_model());

COMMENT ON FUNCTION public.can_sync_catalog_read_model()
  IS 'Allows active internal/admin users to maintain catalog cache rows imported from 1C. Does not grant commercial data access and does not use external_1c_id as a security boundary.';
