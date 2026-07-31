begin;

update public.permissions
set scope = 'both'
where code in (
  'purchase_templates.view',
  'purchase_templates.create',
  'purchase_templates.edit_own',
  'purchase_templates.edit_company',
  'purchase_templates.archive',
  'purchase_templates.use'
)
and scope <> 'both';

commit;
