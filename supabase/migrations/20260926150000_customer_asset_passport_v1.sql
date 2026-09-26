begin;

create index if not exists customer_service_requests_identity_line_updated_idx
  on public.customer_service_requests(customer_identity_id, retail_order_line_id, updated_at desc, id desc)
  where retail_order_line_id is not null;

create index if not exists installation_project_items_order_line_project_idx
  on public.installation_project_items(retail_order_line_id, project_id)
  where retail_order_line_id is not null;

create or replace function public.get_customer_equipment_passport_v1(
  p_customer_account_id uuid,
  p_customer_identity_id uuid,
  p_actor_user_id uuid,
  p_retail_order_line_id uuid,
  p_service_limit integer default 5
) returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_service_limit integer := least(greatest(coalesce(p_service_limit, 5), 1), 10);
  v_result jsonb;
begin
  if not exists (
    select 1
    from public.customer_accounts account
    where account.id = p_customer_account_id
      and account.customer_identity_id = p_customer_identity_id
      and account.auth_user_id = p_actor_user_id
      and account.status = 'ACTIVE'
  ) then
    raise exception 'Invalid customer context.' using errcode = '42501';
  end if;

  select orders.id into v_order_id
  from public.retail_order_lines line
  join public.retail_orders orders on orders.id = line.order_id
  join public.retail_customers customer on customer.id = orders.customer_id
  where line.id = p_retail_order_line_id
    and customer.customer_identity_id = p_customer_identity_id
    and orders.status = 'confirmed'
    and orders.paid_at is not null;

  if v_order_id is null then return null; end if;

  with object_context as (
    select object_row.id, object_row.name, object_row.status
    from public.customer_object_purchase_links link
    join public.customer_objects object_row on object_row.id = link.customer_object_id
    where link.retail_order_id = v_order_id
      and object_row.customer_identity_id = p_customer_identity_id
    order by link.updated_at desc, link.id desc
    limit 1
  ), installation_context as (
    select project.id, project.status, assignment.completed_at, project.updated_at
    from public.installation_project_items item
    join public.installation_projects project on project.id = item.project_id
    left join public.installation_partner_assignments assignment on assignment.id = project.selected_assignment_id
    where item.retail_order_line_id = p_retail_order_line_id
      and project.customer_account_id = p_customer_account_id
      and project.customer_identity_id = p_customer_identity_id
    order by project.updated_at desc, project.id desc
    limit 1
  ), service_context as (
    select request.id, request.public_number, request.subject, request.status, request.created_at, request.updated_at
    from public.customer_service_requests request
    where request.customer_identity_id = p_customer_identity_id
      and request.retail_order_line_id = p_retail_order_line_id
    order by request.updated_at desc, request.id desc
    limit v_service_limit
  )
  select jsonb_build_object(
    'object', (select jsonb_build_object('id', object_row.id, 'name', object_row.name, 'status', object_row.status) from object_context object_row),
    'installation', (select jsonb_build_object(
      'projectId', installation.id,
      'projectStatus', installation.status,
      'completedAt', installation.completed_at
    ) from installation_context installation),
    'serviceHistory', coalesce((select jsonb_agg(jsonb_build_object(
      'id', service.id,
      'number', service.public_number,
      'subject', service.subject,
      'status', service.status,
      'createdAt', service.created_at,
      'updatedAt', service.updated_at
    ) order by service.updated_at desc, service.id desc) from service_context service), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_customer_equipment_passport_v1(uuid,uuid,uuid,uuid,integer) from public, anon, authenticated, service_role;
grant execute on function public.get_customer_equipment_passport_v1(uuid,uuid,uuid,uuid,integer) to service_role;

comment on function public.get_customer_equipment_passport_v1(uuid,uuid,uuid,uuid,integer) is
  'Returns one owned paid retail line asset context with exact object, installation and bounded service evidence; never infers installation, serial or warranty.';

commit;
