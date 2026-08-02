begin;

insert into public.permissions(code, description) values
  ('service.view', 'View company service and warranty cases.'),
  ('service.create', 'Create and respond to company service cases.'),
  ('admin.service.view', 'View service cases across partner companies.'),
  ('admin.service.manage', 'Manage service case workflow and internal notes.')
on conflict (code) do nothing;

with grants(role_code, permission_code) as (values
  ('partner_owner','service.view'),('partner_owner','service.create'),
  ('partner_manager','service.view'),('partner_manager','service.create'),
  ('partner_buyer','service.view'),('partner_buyer','service.create'),
  ('partner_viewer','service.view'),
  ('novotech_admin','admin.service.view'),('novotech_admin','admin.service.manage'),
  ('novotech_sales','admin.service.view'),('novotech_sales','admin.service.manage')
)
insert into public.role_permissions(role_id, permission_id)
select r.id,p.id from grants g join public.roles r on r.code=g.role_code join public.permissions p on p.code=g.permission_code
on conflict do nothing;

insert into public.partner_access_preset_capabilities(preset_code, permission_id)
select 'full_partner_access', id from public.permissions where code in ('service.view','service.create')
on conflict do nothing;
insert into public.partner_company_capabilities(company_id, permission_id, enabled_by)
select policy.company_id, permission.id, policy.changed_by
from public.partner_company_access_policies policy
join public.permissions permission on permission.code in ('service.view','service.create')
where policy.preset_code='full_partner_access'
on conflict do nothing;

create sequence public.service_case_number_seq;

create table public.service_cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  created_by_user_id uuid not null references public.user_profiles(id) on delete restrict,
  assigned_internal_user_id uuid null references public.user_profiles(id) on delete set null,
  case_number text not null unique default ('SRV-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.service_case_number_seq')::text,6,'0')),
  case_type text not null check (case_type in ('warranty_diagnosis','repair_request','replacement_request','return_request','technical_consultation','missing_item_or_accessory','other_product_issue')),
  status text not null default 'created' check (status in ('created','accepted','awaiting_equipment','equipment_received','diagnostics','awaiting_information','repair','replacement_approved','awaiting_replacement','ready_for_pickup','closed','rejected','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  product_id uuid null references public.catalog_products(id) on delete restrict,
  order_id uuid null references public.partner_order_history(id) on delete restrict,
  order_line_id uuid null references public.partner_order_history_items(id) on delete restrict,
  serial_number_id uuid null,
  entered_serial_number text null check (entered_serial_number is null or char_length(btrim(entered_serial_number)) between 2 and 120),
  fault_category text not null check (char_length(btrim(fault_category)) between 2 and 100),
  partner_description text not null check (char_length(btrim(partner_description)) between 10 and 4000),
  symptoms text null check (symptoms is null or char_length(symptoms) <= 2000),
  issue_started_on date null,
  powers_on boolean null,
  factory_reset_attempted boolean null,
  preferred_contact text null check (preferred_contact is null or char_length(preferred_contact) <= 200),
  evidence_consent boolean not null,
  purchase_verification_state text not null check (purchase_verification_state in ('verified_order','pending_manual_product','verification_required')),
  internal_resolution_summary text null check (internal_resolution_summary is null or char_length(internal_resolution_summary) <= 4000),
  warranty_eligibility_state text not null default 'verification_required' check (warranty_eligibility_state in ('eligible','expired','verification_required','serial_not_found','purchase_not_found','excluded_by_policy','manually_approved','manually_rejected')),
  warranty_end_date date null,
  replacement_policy_state text not null default 'not_evaluated' check (replacement_policy_state in ('not_evaluated','possible_candidate','eligible_after_diagnosis','not_eligible','approved','rejected')),
  first_response_due_at timestamptz not null default (now() + interval '8 hours'),
  diagnosis_due_at timestamptz null,
  partner_response_due_at timestamptz null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null
);

create table public.service_case_events (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.service_cases(id) on delete restrict,
  actor_user_id uuid null references public.user_profiles(id) on delete set null,
  event_type text not null check (event_type in ('created','partner_message','internal_note','assigned','status_changed','evidence_uploaded','document_linked','warranty_evaluated','replacement_evaluated','cancelled')),
  partner_visible boolean not null default true, message text null check (message is null or char_length(message) <= 4000),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object'), occurred_at timestamptz not null default now()
);
create table public.service_case_status_history (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.service_cases(id) on delete restrict,
  actor_user_id uuid null references public.user_profiles(id) on delete set null, from_status text null, to_status text not null,
  reason text null check (reason is null or char_length(reason) <= 1000), occurred_at timestamptz not null default now()
);
create table public.service_case_product_evidence (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.service_cases(id) on delete restrict,
  product_id uuid null references public.catalog_products(id) on delete restrict, order_id uuid null references public.partner_order_history(id) on delete restrict,
  order_line_id uuid null references public.partner_order_history_items(id) on delete restrict, external_product_ref text null,
  product_sku text null, product_name text null, serial_value text null, purchase_date date null,
  verification_state text not null, captured_at timestamptz not null default now()
);
create table public.service_case_attachments (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.service_cases(id) on delete restrict,
  uploaded_by_user_id uuid not null references public.user_profiles(id) on delete restrict, file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  file_size bigint not null check (file_size between 1 and 15728640), checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  storage_bucket text not null default 'service-evidence' check (storage_bucket='service-evidence'), storage_key text not null unique,
  scan_state text not null default 'not_available' check (scan_state in ('not_available','pending','clean','rejected')),
  created_at timestamptz not null default now()
);
create table public.service_case_documents (
  case_id uuid not null references public.service_cases(id) on delete restrict,
  document_id uuid not null references public.partner_documents(id) on delete restrict,
  partner_visible boolean not null default true, linked_by_user_id uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(), primary key(case_id,document_id)
);

create index service_cases_company_updated_idx on public.service_cases(company_id, updated_at desc, id desc);
create index service_cases_admin_queue_idx on public.service_cases(status, first_response_due_at, updated_at desc);
create index service_cases_product_idx on public.service_cases(product_id, updated_at desc);
create index service_events_case_idx on public.service_case_events(case_id, occurred_at, id);
create index service_attachments_case_idx on public.service_case_attachments(case_id, created_at);
create index service_documents_case_idx on public.service_case_documents(case_id, created_at);

create or replace function public.prevent_service_history_mutation() returns trigger language plpgsql set search_path=public as $$ begin raise exception 'Service history is append-only.' using errcode='55000'; end $$;
create trigger service_events_immutable before update or delete on public.service_case_events for each row execute function public.prevent_service_history_mutation();
create trigger service_status_history_immutable before update or delete on public.service_case_status_history for each row execute function public.prevent_service_history_mutation();
create trigger service_product_evidence_immutable before update or delete on public.service_case_product_evidence for each row execute function public.prevent_service_history_mutation();

alter table public.service_cases enable row level security;
alter table public.service_case_events enable row level security;
alter table public.service_case_status_history enable row level security;
alter table public.service_case_product_evidence enable row level security;
alter table public.service_case_attachments enable row level security;
alter table public.service_case_documents enable row level security;
revoke all on public.service_cases,public.service_case_events,public.service_case_status_history,public.service_case_product_evidence,public.service_case_attachments,public.service_case_documents from public,anon,authenticated;
grant all on public.service_cases,public.service_case_events,public.service_case_status_history,public.service_case_product_evidence,public.service_case_attachments,public.service_case_documents to service_role;

create or replace function public.can_access_service_case(p_case_id uuid, p_manage boolean default false)
returns boolean language sql stable security definer set search_path=public set row_security=off as $$
  select exists(select 1 from public.service_cases c where c.id=p_case_id and public.has_permission(c.company_id,case when p_manage then 'service.create' else 'service.view' end))
    or public.has_internal_permission(case when p_manage then 'admin.service.manage' else 'admin.service.view' end)
$$;

create or replace function public.create_service_case(p_company_id uuid,p_case_type text,p_product_id uuid,p_order_id uuid,p_order_line_id uuid,p_entered_serial text,p_fault_category text,p_description text,p_symptoms text,p_issue_started_on date,p_powers_on boolean,p_factory_reset boolean,p_preferred_contact text,p_evidence_consent boolean)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare c public.service_cases; product public.catalog_products; history public.partner_order_history; line public.partner_order_history_items;
begin
  if not public.has_permission(p_company_id,'service.create') then raise exception 'Service access denied' using errcode='42501'; end if;
  if not coalesce(p_evidence_consent,false) then raise exception 'Evidence consent is required' using errcode='22023'; end if;
  if p_product_id is not null then select * into product from public.catalog_products where id=p_product_id and is_active and is_visible; if not found then raise exception 'Product unavailable' using errcode='22023'; end if; end if;
  if p_order_id is not null then select * into history from public.partner_order_history where id=p_order_id and company_id=p_company_id and partner_visible and not one_c_deletion_mark; if not found then raise exception 'Order unavailable' using errcode='22023'; end if; end if;
  if p_order_line_id is not null then select * into line from public.partner_order_history_items where id=p_order_line_id and order_history_id=p_order_id; if not found or (p_product_id is not null and line.product_id is distinct from p_product_id) then raise exception 'Order line mismatch' using errcode='22023'; end if; end if;
  insert into public.service_cases(company_id,created_by_user_id,case_type,product_id,order_id,order_line_id,entered_serial_number,fault_category,partner_description,symptoms,issue_started_on,powers_on,factory_reset_attempted,preferred_contact,evidence_consent,purchase_verification_state,warranty_eligibility_state)
  values(p_company_id,auth.uid(),p_case_type,p_product_id,p_order_id,p_order_line_id,nullif(btrim(p_entered_serial),''),btrim(p_fault_category),btrim(p_description),nullif(btrim(p_symptoms),''),p_issue_started_on,p_powers_on,p_factory_reset,nullif(btrim(p_preferred_contact),''),true,case when p_order_id is not null and p_order_line_id is not null then 'verified_order' when p_product_id is not null then 'pending_manual_product' else 'verification_required' end,case when nullif(btrim(p_entered_serial),'') is null then 'serial_not_found' else 'verification_required' end) returning * into c;
  insert into public.service_case_events(case_id,actor_user_id,event_type,message) values(c.id,auth.uid(),'created','Заявка зарегистрирована.');
  insert into public.service_case_status_history(case_id,actor_user_id,to_status,reason) values(c.id,auth.uid(),'created','Partner submission');
  insert into public.service_case_product_evidence(case_id,product_id,order_id,order_line_id,external_product_ref,product_sku,product_name,serial_value,purchase_date,verification_state)
  values(c.id,p_product_id,p_order_id,p_order_line_id,coalesce(product.external_1c_id,line.external_product_ref),coalesce(product.sku,line.sku),coalesce(product.name,line.product_name),nullif(btrim(p_entered_serial),''),history.one_c_document_date::date,c.purchase_verification_state);
  return jsonb_build_object('id',c.id,'caseNumber',c.case_number,'status',c.status);
end $$;

create or replace function public.list_partner_service_cases(p_company_id uuid,p_query text default '',p_status text default null,p_page integer default 1,p_page_size integer default 20)
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
with input as(select lower(btrim(coalesce(p_query,''))) q,greatest(p_page,1) page,least(greatest(p_page_size,1),50) page_size), visible as(
 select c.*,p.sku,p.name product_name,p.image_url from public.service_cases c left join public.catalog_products p on p.id=c.product_id,input
 where c.company_id=p_company_id and public.has_permission(p_company_id,'service.view') and (p_status is null or c.status=p_status)
 and (input.q='' or lower(c.case_number||' '||coalesce(p.sku,'')||' '||coalesce(p.name,'')||' '||coalesce(c.entered_serial_number,'')) like '%'||input.q||'%'))
select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',id,'caseNumber',case_number,'caseType',case_type,'status',status,'priority',priority,'productSku',sku,'productName',product_name,'productImageUrl',image_url,'serialNumber',entered_serial_number,'warrantyState',warranty_eligibility_state,'replacementState',replacement_policy_state,'createdAt',created_at,'updatedAt',updated_at,'overdue',status not in ('closed','rejected','cancelled') and first_response_due_at<now()) order by updated_at desc,id desc),'[]'::jsonb),'total',coalesce(max(total_count),0),'page',(select page from input)) from (select visible.*,count(*) over() total_count from visible order by updated_at desc,id desc offset (select (page-1)*page_size from input) limit (select page_size from input)) page_rows
$$;

create or replace function public.get_service_case(p_case_id uuid)
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
select case when public.can_access_service_case(c.id,false) then jsonb_build_object(
 'id',c.id,'companyId',c.company_id,'caseNumber',c.case_number,'caseType',c.case_type,'status',c.status,'priority',c.priority,'productId',c.product_id,'orderId',c.order_id,'orderLineId',c.order_line_id,'serialNumber',c.entered_serial_number,'faultCategory',c.fault_category,'description',c.partner_description,'symptoms',c.symptoms,'issueStartedOn',c.issue_started_on,'powersOn',c.powers_on,'factoryResetAttempted',c.factory_reset_attempted,'preferredContact',c.preferred_contact,'purchaseVerificationState',c.purchase_verification_state,'warrantyState',c.warranty_eligibility_state,'warrantyEndDate',c.warranty_end_date,'replacementState',c.replacement_policy_state,'assignedInternalUserId',c.assigned_internal_user_id,'createdAt',c.created_at,'updatedAt',c.updated_at,'version',c.version,
 'product',case when p.id is null then null else jsonb_build_object('id',p.id,'sku',p.sku,'name',p.name,'imageUrl',p.image_url) end,
 'order',case when h.id is null then null else jsonb_build_object('id',h.id,'number',h.external_1c_order_number,'date',h.one_c_document_date) end,
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'type',e.event_type,'message',e.message,'occurredAt',e.occurred_at) order by e.occurred_at,e.id) from public.service_case_events e where e.case_id=c.id and (public.has_internal_permission('admin.service.view') or e.partner_visible)),'[]'::jsonb),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'fileName',a.file_name,'mimeType',a.mime_type,'fileSize',a.file_size,'createdAt',a.created_at) order by a.created_at) from public.service_case_attachments a where a.case_id=c.id and a.scan_state<>'rejected'),'[]'::jsonb),
 'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'documentType',d.document_type,'fileName',d.file_name) order by link.created_at) from public.service_case_documents link join public.partner_documents d on d.id=link.document_id where link.case_id=c.id and (public.has_internal_permission('admin.service.view') or link.partner_visible)),'[]'::jsonb)) else null end
from public.service_cases c left join public.catalog_products p on p.id=c.product_id left join public.partner_order_history h on h.id=c.order_id where c.id=p_case_id
$$;

create or replace function public.add_service_case_partner_message(p_case_id uuid,p_message text)
returns uuid language plpgsql security definer set search_path=public set row_security=off as $$ declare event_id uuid; begin
 if not public.can_access_service_case(p_case_id,true) then raise exception 'Service access denied' using errcode='42501'; end if;
 if char_length(btrim(p_message)) not between 2 and 4000 then raise exception 'Invalid message' using errcode='22023'; end if;
 insert into public.service_case_events(case_id,actor_user_id,event_type,partner_visible,message) values(p_case_id,auth.uid(),'partner_message',true,btrim(p_message)) returning id into event_id;
 update public.service_cases set updated_at=now(),version=version+1 where id=p_case_id; return event_id; end $$;

create or replace function public.transition_service_case(p_case_id uuid,p_expected_version integer,p_to_status text,p_partner_message text,p_internal_note text,p_assignee uuid default null)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare c public.service_cases; allowed boolean; old_status text; begin
 if not public.has_internal_permission('admin.service.manage') then raise exception 'Service management denied' using errcode='42501'; end if;
 select * into c from public.service_cases where id=p_case_id for update; if not found then raise exception 'Case not found' using errcode='P0002'; end if; old_status:=c.status;
 if c.version<>p_expected_version then raise exception 'Case changed' using errcode='40001'; end if;
 allowed := case c.status when 'created' then p_to_status in ('accepted','rejected','cancelled') when 'accepted' then p_to_status in ('awaiting_equipment','equipment_received','awaiting_information','rejected') when 'awaiting_equipment' then p_to_status in ('equipment_received','awaiting_information') when 'equipment_received' then p_to_status='diagnostics' when 'diagnostics' then p_to_status in ('awaiting_information','repair','replacement_approved','rejected') when 'awaiting_information' then p_to_status in ('accepted','diagnostics') when 'repair' then p_to_status='ready_for_pickup' when 'replacement_approved' then p_to_status in ('awaiting_replacement','ready_for_pickup') when 'awaiting_replacement' then p_to_status='ready_for_pickup' when 'ready_for_pickup' then p_to_status='closed' else false end;
 if not allowed then raise exception 'Invalid service transition' using errcode='22023'; end if;
 update public.service_cases set status=p_to_status,assigned_internal_user_id=coalesce(p_assignee,assigned_internal_user_id),updated_at=now(),version=version+1,closed_at=case when p_to_status in ('closed','rejected','cancelled') then now() else null end,diagnosis_due_at=case when p_to_status='diagnostics' then now()+interval '3 business days' else diagnosis_due_at end,partner_response_due_at=case when p_to_status='awaiting_information' then now()+interval '5 days' else null end where id=p_case_id returning * into c;
 insert into public.service_case_status_history(case_id,actor_user_id,from_status,to_status,reason) values(c.id,auth.uid(),old_status,p_to_status,nullif(btrim(p_partner_message),''));
 insert into public.service_case_events(case_id,actor_user_id,event_type,partner_visible,message,safe_metadata) values(c.id,auth.uid(),'status_changed',true,nullif(btrim(p_partner_message),''),jsonb_build_object('status',p_to_status));
 if nullif(btrim(p_internal_note),'') is not null then insert into public.service_case_events(case_id,actor_user_id,event_type,partner_visible,message) values(c.id,auth.uid(),'internal_note',false,btrim(p_internal_note)); end if;
 return jsonb_build_object('id',c.id,'status',c.status,'version',c.version);
end $$;

create or replace function public.list_admin_service_cases(p_query text default '',p_status text default null,p_page integer default 1,p_page_size integer default 25)
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
with input as(select lower(btrim(coalesce(p_query,''))) q,greatest(p_page,1) page,least(greatest(p_page_size,1),50) page_size),visible as(select c.*,company.display_name company_name,p.sku,p.name product_name from public.service_cases c join public.partner_companies company on company.id=c.company_id left join public.catalog_products p on p.id=c.product_id,input where public.has_internal_permission('admin.service.view') and (p_status is null or c.status=p_status) and (input.q='' or lower(c.case_number||' '||company.display_name||' '||coalesce(p.sku,'')||' '||coalesce(p.name,'')||' '||coalesce(c.entered_serial_number,'')) like '%'||input.q||'%')) select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',id,'caseNumber',case_number,'companyName',company_name,'productSku',sku,'productName',product_name,'serialNumber',entered_serial_number,'status',status,'priority',priority,'warrantyState',warranty_eligibility_state,'replacementState',replacement_policy_state,'assignedInternalUserId',assigned_internal_user_id,'createdAt',created_at,'updatedAt',updated_at,'overdue',status not in ('closed','rejected','cancelled') and first_response_due_at<now()) order by updated_at desc,id desc),'[]'::jsonb),'total',coalesce(max(total_count),0),'page',(select page from input)) from(select visible.*,count(*) over() total_count from visible order by updated_at desc,id desc offset(select (page-1)*page_size from input) limit(select page_size from input)) rows
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('service-evidence','service-evidence',false,15728640,array['image/jpeg','image/png','image/webp','application/pdf']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "Service evidence scoped read" on storage.objects for select to authenticated using(bucket_id='service-evidence' and exists(select 1 from public.service_case_attachments a where a.storage_key=name and public.can_access_service_case(a.case_id,false)));

revoke all on function public.can_access_service_case(uuid,boolean),public.create_service_case(uuid,text,uuid,uuid,uuid,text,text,text,text,date,boolean,boolean,text,boolean),public.list_partner_service_cases(uuid,text,text,integer,integer),public.get_service_case(uuid),public.add_service_case_partner_message(uuid,text),public.transition_service_case(uuid,integer,text,text,text,uuid),public.list_admin_service_cases(text,text,integer,integer) from public,anon;
grant execute on function public.create_service_case(uuid,text,uuid,uuid,uuid,text,text,text,text,date,boolean,boolean,text,boolean),public.list_partner_service_cases(uuid,text,text,integer,integer),public.get_service_case(uuid),public.add_service_case_partner_message(uuid,text),public.transition_service_case(uuid,integer,text,text,text,uuid),public.list_admin_service_cases(text,text,integer,integer) to authenticated;

commit;
