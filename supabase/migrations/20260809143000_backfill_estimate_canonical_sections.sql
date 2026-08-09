-- Ensure every existing estimate has four governed insertion targets.
-- Historical sections and line ownership remain unchanged.

-- Canonical sections own sort slots 0-3. Move legacy ordering out of that
-- reserved range without changing section identity or line ownership.
update public.estimate_sections
set sort_order = sort_order + 1000000
where system_key is null;

with canonical(system_key, name) as (
  values
    ('equipment', 'Оборудование'),
    ('installation_materials', 'Монтажные материалы'),
    ('installation_works', 'Монтажные работы'),
    ('commissioning_works', 'Пусконаладочные работы')
), candidates as (
  select
    section.id,
    canonical.system_key,
    row_number() over (
      partition by section.estimate_id, canonical.system_key
      order by section.sort_order, section.id
    ) as candidate_number
  from public.estimate_sections section
  join canonical on canonical.name = section.name
  where section.system_key is null
    and not exists (
      select 1
      from public.estimate_sections existing
      where existing.estimate_id = section.estimate_id
        and existing.system_key = canonical.system_key
    )
)
update public.estimate_sections section
set system_key = candidate.system_key
from candidates candidate
where section.id = candidate.id
  and candidate.candidate_number = 1;

with canonical(system_key) as (
  values
    ('equipment'),
    ('installation_materials'),
    ('installation_works'),
    ('commissioning_works')
)
insert into public.estimate_sections(
  estimate_id,
  name,
  system_key,
  sort_order,
  show_subtotal,
  discount_percent
)
select
  estimate.id,
  public.canonical_estimate_section_name(canonical.system_key),
  canonical.system_key,
  public.canonical_estimate_section_order(canonical.system_key),
  true,
  0
from public.estimates estimate
cross join canonical
on conflict (estimate_id, system_key) where system_key is not null do nothing;
