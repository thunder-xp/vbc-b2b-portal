-- Repair only the deterministic cart-created section value produced by the
-- previously applied create_estimate_from_cart function.

do $$
declare
  repaired_count integer;
begin
  update public.estimate_sections section
  set name = 'Оборудование',
      updated_at = now()
  where name = 'РћР±РѕСЂСѓРґРѕРІР°РЅРёРµ'
    and exists (
      select 1
      from public.estimate_events event
      where event.estimate_id = section.estimate_id
        and event.event_type = 'created_from_cart'
    );

  get diagnostics repaired_count = row_count;
  raise notice 'Repaired % cart-created estimate section name(s).', repaired_count;
end;
$$;
