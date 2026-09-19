begin;

-- Closed, immutable compatibility cohort. Only accounts that existed when
-- this migration was applied are grandfathered; there is no runtime writer.
create table public.customer_account_legacy_entitlements (
  customer_account_id uuid primary key references public.customer_accounts(id) on delete restrict,
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  cutover_version text not null default 'FINAL_CUSTOMER_PURCHASE_ENTITLEMENT_CUTOVER_V1',
  grandfathered_at timestamptz not null default transaction_timestamp(),
  constraint customer_account_legacy_entitlements_version_check
    check (cutover_version = 'FINAL_CUSTOMER_PURCHASE_ENTITLEMENT_CUTOVER_V1')
);

comment on table public.customer_account_legacy_entitlements is
  'Closed cutover cohort preserving pre-existing Final Customer cabinet access. No post-cutover account may be added.';

insert into public.customer_account_legacy_entitlements (customer_account_id, auth_user_id)
select account.id, account.auth_user_id
from public.customer_accounts account
order by account.id;

create trigger prevent_customer_legacy_entitlement_mutation
before update or delete on public.customer_account_legacy_entitlements
for each row execute function private.prevent_final_customer_provisioning_evidence_mutation();

alter table public.customer_account_legacy_entitlements enable row level security;
alter table public.customer_account_legacy_entitlements force row level security;

revoke all on table public.customer_account_legacy_entitlements
from public, anon, authenticated, service_role;
grant select on table public.customer_account_legacy_entitlements to service_role;

-- One bounded server-only read resolves the complete cabinet entitlement.
-- Auth establishes the principal before this function receives its UUID.
create or replace function public.resolve_customer_access_entitlement_v1(
  p_auth_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select jsonb_build_object(
    'accountStatus', account.status,
    'purchaseBacked', coalesce(entitlement.purchase_backed, false),
    'legacyCompatible', legacy.customer_account_id is not null
  )
  from (select 1) anchor
  left join public.customer_accounts account
    on account.auth_user_id = p_auth_user_id
  left join lateral (
    select true as purchase_backed
    from public.customer_account_purchase_entitlements purchase
    where purchase.customer_account_id = account.id
      and purchase.auth_user_id = p_auth_user_id
    limit 1
  ) entitlement on true
  left join public.customer_account_legacy_entitlements legacy
    on legacy.customer_account_id = account.id
   and legacy.auth_user_id = p_auth_user_id;
$$;

comment on function public.resolve_customer_access_entitlement_v1(uuid) is
  'Server-only, read-only Final Customer access projection: account state plus purchase or closed legacy entitlement evidence.';

create or replace function public.classify_customer_account_access_v1()
returns table(classification text, account_count bigint)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  with classified as (
    select account.id,
      case
        when account.status <> 'ACTIVE' then 'BLOCKED'
        when exists (
          select 1 from public.customer_account_purchase_entitlements purchase
          where purchase.customer_account_id = account.id
            and purchase.auth_user_id = account.auth_user_id
        ) then 'PURCHASE_BACKED'
        when exists (
          select 1 from public.customer_account_legacy_entitlements legacy
          where legacy.customer_account_id = account.id
            and legacy.auth_user_id = account.auth_user_id
        ) then 'LEGACY_COMPATIBILITY'
        else 'NOT_CLASSIFIABLE'
      end as classification
    from public.customer_accounts account
  )
  select expected.classification, count(classified.id)::bigint
  from (values
    ('PURCHASE_BACKED'),
    ('LEGACY_COMPATIBILITY'),
    ('NOT_CLASSIFIABLE'),
    ('BLOCKED')
  ) expected(classification)
  left join classified on classified.classification = expected.classification
  group by expected.classification
  order by expected.classification;
$$;

-- Service code may read/update profiles but can no longer create a cabinet.
-- The authoritative purchase-provisioning SECURITY DEFINER function retains
-- its own database-owned insert authority.
revoke insert on table public.customer_accounts from service_role;
revoke all on function public.resolve_customer_access_entitlement_v1(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.classify_customer_account_access_v1()
from public, anon, authenticated, service_role;
grant execute on function public.resolve_customer_access_entitlement_v1(uuid) to service_role;
grant execute on function public.classify_customer_account_access_v1() to service_role;

commit;
