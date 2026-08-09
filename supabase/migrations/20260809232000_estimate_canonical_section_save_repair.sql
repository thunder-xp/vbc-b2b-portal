-- Allow the commercial-save RPC's bounded position swap without weakening
-- canonical section identity or final ordering.
create or replace function public.protect_canonical_estimate_section()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.system_key is not null then
    if current_setting('app.estimate_batch_update', true) = 'on'
       and new.system_key is not distinct from old.system_key
       and new.name is not distinct from old.name
       and new.sort_order = old.sort_order + 100000
       and new.show_subtotal is not distinct from old.show_subtotal
       and new.discount_percent is not distinct from old.discount_percent then
      return new;
    end if;

    if new.system_key is distinct from old.system_key
       or new.name is distinct from public.canonical_estimate_section_name(old.system_key)
       or new.sort_order is distinct from public.canonical_estimate_section_order(old.system_key)
       or new.show_subtotal is distinct from true
       or new.discount_percent is distinct from 0 then
      raise exception 'Canonical estimate section structure is immutable.' using errcode = '23514';
    end if;
  end if;

  if new.system_key is not null then
    new.name := public.canonical_estimate_section_name(new.system_key);
    new.sort_order := public.canonical_estimate_section_order(new.system_key);
    new.show_subtotal := true;
    new.discount_percent := 0;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_canonical_estimate_section() from public, anon, authenticated;
