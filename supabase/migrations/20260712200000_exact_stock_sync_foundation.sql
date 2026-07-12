create table if not exists public.stock_warehouses (
  id uuid primary key default gen_random_uuid(), external_ref text not null unique,
  code text not null default '', name text not null, organization_ref text,
  public_included boolean not null default false, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table public.product_stock_balances
  add column if not exists warehouse_id uuid references public.stock_warehouses(id),
  add column if not exists external_characteristic_ref text not null default '00000000-0000-0000-0000-000000000000',
  add column if not exists physical_quantity numeric(14,3) not null default 0,
  add column if not exists incoming_quantity numeric(14,3) not null default 0,
  add column if not exists synced_at timestamptz,
  add column if not exists last_seen_sync_id uuid,
  add column if not exists is_published boolean not null default false;
create unique index if not exists product_stock_exact_key on public.product_stock_balances(product_id, warehouse_id, external_characteristic_ref) where warehouse_id is not null;

create table if not exists public.product_stock_totals (
  product_id uuid primary key references public.catalog_products(id) on delete cascade,
  physical_quantity numeric(14,3) not null default 0,
  reserved_quantity numeric(14,3) not null default 0,
  available_quantity numeric(14,3) not null default 0,
  incoming_quantity numeric(14,3) not null default 0,
  has_variant_stock boolean not null default false,
  synced_at timestamptz not null, last_seen_sync_id uuid not null,
  is_published boolean not null default true
);

create table if not exists public.stock_sync_state (
  id text primary key, status text not null default 'never_run' check (status in ('never_run','queued','running','succeeded','failed')),
  active_sync_id uuid, last_failed_sync_id uuid, snapshot_time timestamptz,
  current_stage text, next_skip integer not null default 0, page_size integer not null default 500,
  pages_processed integer not null default 0, physical_rows integer not null default 0,
  reserved_rows integer not null default 0, incoming_rows integer not null default 0,
  warehouses_loaded integer not null default 0, products_matched integer not null default 0,
  products_unmatched integer not null default 0, rows_published integer not null default 0,
  rows_deactivated integer not null default 0, scan_complete boolean not null default false,
  started_at timestamptz, finished_at timestamptz, last_successful_sync_at timestamptz,
  error_category text, failed_stage text, safe_error text, database_error_code text, failed_page integer,
  active_chunk_token uuid, chunk_started_at timestamptz, updated_at timestamptz not null default now()
);
insert into public.stock_sync_state(id) values ('exact_stock') on conflict (id) do nothing;

create table if not exists public.stock_warehouse_sync_stage (
  sync_id uuid not null, external_ref text not null, code text not null, name text not null,
  organization_ref text, is_active boolean not null, primary key(sync_id, external_ref)
);
create table if not exists public.stock_balance_sync_stage (
  sync_id uuid not null, balance_kind text not null check (balance_kind in ('physical','reserved','incoming')),
  external_product_ref text not null, external_warehouse_ref text not null,
  external_characteristic_ref text not null, quantity numeric(14,3) not null,
  primary key(sync_id, balance_kind, external_product_ref, external_warehouse_ref, external_characteristic_ref)
);

alter table public.stock_warehouses enable row level security;
alter table public.product_stock_totals enable row level security;
alter table public.stock_sync_state enable row level security;
alter table public.stock_warehouse_sync_stage enable row level security;
alter table public.stock_balance_sync_stage enable row level security;
revoke all on public.stock_warehouses, public.product_stock_totals, public.stock_sync_state, public.stock_warehouse_sync_stage, public.stock_balance_sync_stage from anon, authenticated;
grant select on public.product_stock_totals to authenticated;
grant select,insert,update,delete on public.stock_warehouses, public.product_stock_totals, public.stock_sync_state, public.stock_warehouse_sync_stage, public.stock_balance_sync_stage to service_role;
drop policy if exists "Approved users read published stock totals" on public.product_stock_totals;
create policy "Approved users read published stock totals" on public.product_stock_totals for select to authenticated using (is_published and public.can_select_product_commercial_data(product_id, null, 'stock.view'));

create or replace function public.stage_stock_balance_rows(p_sync_id uuid, p_kind text, p_rows jsonb)
returns integer language plpgsql security invoker set search_path=public as $$
declare v_count integer;
begin
  with source as (
    select row.external_product_ref, row.external_warehouse_ref, row.external_characteristic_ref, row.quantity
    from jsonb_to_recordset(p_rows) row(external_product_ref text, external_warehouse_ref text, external_characteristic_ref text, quantity numeric)
  ), aggregated as (
    select external_product_ref, external_warehouse_ref, external_characteristic_ref, sum(quantity) quantity
    from source group by external_product_ref, external_warehouse_ref, external_characteristic_ref
  )
  insert into public.stock_balance_sync_stage as current(sync_id,balance_kind,external_product_ref,external_warehouse_ref,external_characteristic_ref,quantity)
  select p_sync_id,p_kind,external_product_ref,external_warehouse_ref,external_characteristic_ref,quantity from aggregated
  on conflict(sync_id,balance_kind,external_product_ref,external_warehouse_ref,external_characteristic_ref)
  do update set quantity=current.quantity+excluded.quantity;
  get diagnostics v_count=row_count; return v_count;
end $$;

create or replace function public.claim_stock_sync_chunk(p_sync_id uuid,p_token uuid)
returns boolean language plpgsql security invoker set search_path=public as $$
declare claimed boolean; begin
 update public.stock_sync_state set active_chunk_token=p_token,chunk_started_at=now(),updated_at=now()
 where id='exact_stock' and active_sync_id=p_sync_id and status in ('queued','running')
 and (active_chunk_token is null or chunk_started_at < now()-interval '2 minutes');
 get diagnostics claimed=row_count; return claimed; end $$;

create or replace function public.publish_exact_stock_snapshot(p_sync_id uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare published_count integer:=0; deactivated_count integer:=0; matched_count integer:=0; unmatched_count integer:=0;
begin
 if not exists(select 1 from public.stock_sync_state where id='exact_stock' and active_sync_id=p_sync_id and scan_complete) then raise exception 'stock sync incomplete'; end if;
 insert into public.stock_warehouses(external_ref,code,name,organization_ref,public_included,is_active,updated_at)
 select s.external_ref,s.code,s.name,s.organization_ref,
   case when lower(s.name)='depozit principal chisinau' then true else coalesce(w.public_included,false) end,
   s.is_active,now() from public.stock_warehouse_sync_stage s
 left join public.stock_warehouses w on w.external_ref=s.external_ref where s.sync_id=p_sync_id
 on conflict(external_ref) do update set code=excluded.code,name=excluded.name,organization_ref=excluded.organization_ref,is_active=excluded.is_active,updated_at=now();

 select count(distinct s.external_product_ref) into unmatched_count from public.stock_balance_sync_stage s left join public.catalog_products p on p.external_1c_id=s.external_product_ref where s.sync_id=p_sync_id and p.id is null;
 select count(distinct p.id) into matched_count from public.stock_balance_sync_stage s join public.catalog_products p on p.external_1c_id=s.external_product_ref where s.sync_id=p_sync_id;

 with keys as (select distinct external_product_ref,external_warehouse_ref,external_characteristic_ref from public.stock_balance_sync_stage where sync_id=p_sync_id), merged as (
   select k.*,coalesce(p.quantity,0) physical,coalesce(r.quantity,0) reserved,coalesce(i.quantity,0) incoming
   from keys k left join public.stock_balance_sync_stage p on p.sync_id=p_sync_id and p.balance_kind='physical' and (p.external_product_ref,p.external_warehouse_ref,p.external_characteristic_ref)=(k.external_product_ref,k.external_warehouse_ref,k.external_characteristic_ref)
   left join public.stock_balance_sync_stage r on r.sync_id=p_sync_id and r.balance_kind='reserved' and (r.external_product_ref,r.external_warehouse_ref,r.external_characteristic_ref)=(k.external_product_ref,k.external_warehouse_ref,k.external_characteristic_ref)
   left join public.stock_balance_sync_stage i on i.sync_id=p_sync_id and i.balance_kind='incoming' and (i.external_product_ref,i.external_warehouse_ref,i.external_characteristic_ref)=(k.external_product_ref,k.external_warehouse_ref,k.external_characteristic_ref)
 )
 insert into public.product_stock_balances(product_id,warehouse_id,warehouse_name,external_characteristic_ref,physical_quantity,reserved_quantity,available_quantity,incoming_quantity,updated_from_1c_at,synced_at,last_seen_sync_id,is_published,is_active)
 select cp.id,w.id,w.name,m.external_characteristic_ref,m.physical,m.reserved,greatest(0,m.physical-m.reserved),m.incoming,now(),now(),p_sync_id,true,true
 from merged m join public.catalog_products cp on cp.external_1c_id=m.external_product_ref join public.stock_warehouses w on w.external_ref=m.external_warehouse_ref
 on conflict(product_id,warehouse_id,external_characteristic_ref) where warehouse_id is not null do update set physical_quantity=excluded.physical_quantity,reserved_quantity=excluded.reserved_quantity,available_quantity=excluded.available_quantity,incoming_quantity=excluded.incoming_quantity,synced_at=now(),last_seen_sync_id=p_sync_id,is_published=true,is_active=true;
 get diagnostics published_count=row_count;
 update public.product_stock_balances set is_active=false,is_published=false where warehouse_id is not null and last_seen_sync_id is distinct from p_sync_id;
 get diagnostics deactivated_count=row_count;

 insert into public.product_stock_totals(product_id,physical_quantity,reserved_quantity,available_quantity,incoming_quantity,has_variant_stock,synced_at,last_seen_sync_id,is_published)
 select b.product_id,
  coalesce(sum(b.physical_quantity) filter(where b.external_characteristic_ref='00000000-0000-0000-0000-000000000000'),0),
  coalesce(sum(b.reserved_quantity) filter(where b.external_characteristic_ref='00000000-0000-0000-0000-000000000000'),0),
  coalesce(sum(b.available_quantity) filter(where b.external_characteristic_ref='00000000-0000-0000-0000-000000000000'),0),
  coalesce(sum(b.incoming_quantity) filter(where b.external_characteristic_ref='00000000-0000-0000-0000-000000000000'),0),
  bool_or(b.external_characteristic_ref<>'00000000-0000-0000-0000-000000000000' and b.available_quantity>0),now(),p_sync_id,true
 from public.product_stock_balances b join public.stock_warehouses w on w.id=b.warehouse_id
 where b.is_published and b.is_active and w.public_included and w.is_active group by b.product_id
 on conflict(product_id) do update set physical_quantity=excluded.physical_quantity,reserved_quantity=excluded.reserved_quantity,available_quantity=excluded.available_quantity,incoming_quantity=excluded.incoming_quantity,has_variant_stock=excluded.has_variant_stock,synced_at=now(),last_seen_sync_id=p_sync_id,is_published=true;
 update public.product_stock_totals set is_published=false where last_seen_sync_id is distinct from p_sync_id;
 delete from public.stock_balance_sync_stage where sync_id=p_sync_id; delete from public.stock_warehouse_sync_stage where sync_id=p_sync_id;
 update public.stock_sync_state set status='succeeded',current_stage='completed',finished_at=now(),last_successful_sync_at=now(),products_matched=matched_count,products_unmatched=unmatched_count,rows_published=published_count,rows_deactivated=deactivated_count,active_sync_id=null,active_chunk_token=null,chunk_started_at=null,updated_at=now() where id='exact_stock' and active_sync_id=p_sync_id;
 return jsonb_build_object('published',published_count,'deactivated',deactivated_count,'matched',matched_count,'unmatched',unmatched_count);
end $$;

revoke all on function public.stage_stock_balance_rows(uuid,text,jsonb), public.claim_stock_sync_chunk(uuid,uuid), public.publish_exact_stock_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.stage_stock_balance_rows(uuid,text,jsonb), public.claim_stock_sync_chunk(uuid,uuid), public.publish_exact_stock_snapshot(uuid) to service_role;
