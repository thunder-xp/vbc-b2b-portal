begin;

update public.permissions
set scope = 'partner',
    category = 'service'
where code in ('service.view', 'service.create')
  and (scope is distinct from 'partner' or category is distinct from 'service');

commit;
