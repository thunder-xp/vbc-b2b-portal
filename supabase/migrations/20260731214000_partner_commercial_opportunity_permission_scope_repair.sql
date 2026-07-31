-- Partner opportunity access was seeded after unified access control and
-- inherited the conservative internal-only permission scope.
update public.permissions
set
  scope = 'partner',
  category = 'catalog',
  sensitive = false
where code = 'opportunities.view'
  and (scope, category, sensitive) is distinct from ('partner', 'catalog', false);

update public.permissions
set
  scope = 'internal',
  category = 'commercial',
  sensitive = true
where code = 'admin.opportunities.view'
  and (scope, category, sensitive) is distinct from ('internal', 'commercial', true);
