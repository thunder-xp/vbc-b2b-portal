begin;

set local lock_timeout = '5s';

alter table public.catalog_products
  add column if not exists image_original_url text null,
  add column if not exists image_normalization_status text not null default 'missing',
  add column if not exists image_normalized_storage_key text null,
  add column if not exists image_normalization_source_url text null,
  add column if not exists image_normalization_metadata jsonb not null default '{}'::jsonb,
  add column if not exists image_normalized_at timestamptz null;

alter table public.catalog_products
  drop constraint if exists catalog_products_image_normalization_status_check;
alter table public.catalog_products
  add constraint catalog_products_image_normalization_status_check
  check (image_normalization_status in ('missing', 'pending', 'normalized', 'skipped', 'review_needed', 'failed'));

update public.catalog_products
set image_original_url = coalesce(image_original_url, image_source_url, image_url),
    image_normalization_status = case
      when coalesce(image_original_url, image_source_url, image_url) is null then 'missing'
      else 'pending'
    end
where image_original_url is null;

create table public.catalog_product_image_normalization_jobs (
  product_id uuid primary key references public.catalog_products(id) on delete cascade,
  source_url text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'skipped', 'review_needed', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  claim_token uuid null,
  claimed_at timestamptz null,
  previous_storage_key text null,
  result_storage_key text null,
  safe_reason text null,
  last_error_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index catalog_product_image_jobs_claim_idx
  on public.catalog_product_image_normalization_jobs(status, updated_at, product_id)
  where attempts < 3 and status in ('queued', 'failed', 'running');

alter table public.catalog_product_image_normalization_jobs enable row level security;
revoke all on table public.catalog_product_image_normalization_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.catalog_product_image_normalization_jobs to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-normalized-images', 'catalog-normalized-images', true, 524288, array['image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.prepare_catalog_product_image_normalization()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.image_original_url is null then
    new.image_original_url := old.image_original_url;
  end if;
  if tg_op = 'INSERT' or new.image_original_url is distinct from old.image_original_url then
    new.image_source_url := new.image_original_url;
    new.image_normalization_source_url := new.image_original_url;
    new.image_normalized_storage_key := null;
    new.image_normalized_at := null;
    new.image_normalization_metadata := '{}'::jsonb;
    new.image_normalization_status := case when new.image_original_url is null then 'missing' else 'pending' end;
  end if;
  return new;
end;
$$;

drop trigger if exists prepare_catalog_product_image_normalization_trigger on public.catalog_products;
create trigger prepare_catalog_product_image_normalization_trigger
before insert or update of image_original_url on public.catalog_products
for each row execute function public.prepare_catalog_product_image_normalization();

create or replace function public.enqueue_catalog_product_image_normalization()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.image_original_url is null then
    delete from public.catalog_product_image_normalization_jobs where product_id = new.id;
  else
    insert into public.catalog_product_image_normalization_jobs(
      product_id, source_url, status, attempts, previous_storage_key, updated_at
    ) values (
      new.id, new.image_original_url, 'queued', 0, old.image_normalized_storage_key, now()
    )
    on conflict (product_id) do update
    set source_url = excluded.source_url,
        status = 'queued',
        attempts = 0,
        claim_token = null,
        claimed_at = null,
        previous_storage_key = coalesce(
          public.catalog_product_image_normalization_jobs.result_storage_key,
          public.catalog_product_image_normalization_jobs.previous_storage_key
        ),
        result_storage_key = null,
        safe_reason = null,
        last_error_code = null,
        completed_at = null,
        updated_at = now();
  end if;
  return null;
end;
$$;

drop trigger if exists enqueue_catalog_product_image_normalization_insert_trigger on public.catalog_products;
create trigger enqueue_catalog_product_image_normalization_insert_trigger
after insert on public.catalog_products
for each row execute function public.enqueue_catalog_product_image_normalization();

drop trigger if exists enqueue_catalog_product_image_normalization_update_trigger on public.catalog_products;
create trigger enqueue_catalog_product_image_normalization_update_trigger
after update of image_original_url on public.catalog_products
for each row when (new.image_original_url is distinct from old.image_original_url)
execute function public.enqueue_catalog_product_image_normalization();

insert into public.catalog_product_image_normalization_jobs(product_id, source_url, status, attempts)
select product.id, product.image_original_url, 'queued', 0
from public.catalog_products product
where product.image_original_url is not null
on conflict (product_id) do nothing;

create or replace function public.claim_catalog_product_image_normalization_jobs(
  p_batch_size integer,
  p_claim_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare result jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'Not allowed.' using errcode = '42501'; end if;
  if p_claim_token is null or p_batch_size not between 1 and 20 then
    raise exception 'Invalid image normalization claim.' using errcode = '22023';
  end if;

  with claimable as (
    select job.product_id
    from public.catalog_product_image_normalization_jobs job
    join public.catalog_products product on product.id = job.product_id
    where job.attempts < 3
      and (
        job.status in ('queued', 'failed')
        or (job.status = 'running' and job.claimed_at < now() - interval '10 minutes')
      )
    order by product.is_active desc, product.is_visible desc,
      product.sort_order, job.updated_at, job.product_id
    for update skip locked
    limit p_batch_size
  ), claimed as (
    update public.catalog_product_image_normalization_jobs job
    set status = 'running', attempts = job.attempts + 1,
        claim_token = p_claim_token, claimed_at = now(), updated_at = now()
    from claimable
    where job.product_id = claimable.product_id
    returning job.product_id, job.source_url, job.attempts, job.previous_storage_key
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'productId', product_id, 'sourceUrl', source_url,
    'attempt', attempts, 'previousStorageKey', previous_storage_key
  ) order by product_id), '[]'::jsonb) into result from claimed;
  return result;
end;
$$;

create or replace function public.complete_catalog_product_image_normalization_job(
  p_product_id uuid,
  p_claim_token uuid,
  p_source_url text,
  p_status text,
  p_storage_key text,
  p_public_url text,
  p_metadata jsonb,
  p_safe_reason text,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare target public.catalog_product_image_normalization_jobs%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Not allowed.' using errcode = '42501'; end if;
  if p_status not in ('succeeded', 'skipped', 'review_needed', 'failed') then
    raise exception 'Invalid image normalization result.' using errcode = '22023';
  end if;

  select * into target from public.catalog_product_image_normalization_jobs
  where product_id = p_product_id for update;
  if target.product_id is null or target.status <> 'running'
    or target.claim_token is distinct from p_claim_token
    or target.source_url is distinct from p_source_url then
    return jsonb_build_object('code', 'IMAGE_NORMALIZATION_STALE_CLAIM', 'updated', false);
  end if;

  update public.catalog_product_image_normalization_jobs
  set status = p_status, result_storage_key = p_storage_key,
      safe_reason = left(p_safe_reason, 200), last_error_code = left(p_error_code, 80),
      completed_at = case when p_status <> 'failed' or attempts >= 3 then now() else null end,
      claim_token = null, claimed_at = null, updated_at = now()
  where product_id = p_product_id;

  update public.catalog_products
  set image_source_url = case when p_status = 'succeeded' then p_public_url else image_original_url end,
      image_normalization_status = case p_status
        when 'succeeded' then 'normalized'
        when 'skipped' then 'skipped'
        when 'review_needed' then 'review_needed'
        else 'failed'
      end,
      image_normalized_storage_key = case when p_status = 'succeeded' then p_storage_key else null end,
      image_normalization_source_url = p_source_url,
      image_normalization_metadata = coalesce(p_metadata, '{}'::jsonb),
      image_normalized_at = case when p_status = 'succeeded' then now() else null end
  where id = p_product_id and image_original_url = p_source_url;

  return jsonb_build_object('code', 'IMAGE_NORMALIZATION_RECORDED', 'updated', found);
end;
$$;

revoke all on function public.prepare_catalog_product_image_normalization(),
  public.enqueue_catalog_product_image_normalization(),
  public.claim_catalog_product_image_normalization_jobs(integer, uuid),
  public.complete_catalog_product_image_normalization_job(uuid, uuid, text, text, text, text, jsonb, text, text)
from public, anon, authenticated;
grant execute on function public.claim_catalog_product_image_normalization_jobs(integer, uuid),
  public.complete_catalog_product_image_normalization_job(uuid, uuid, text, text, text, text, jsonb, text, text)
to service_role;

create or replace function public.is_safe_public_retail_media_url(p_url text)
returns boolean language sql immutable set search_path = public as $$
  select p_url is not null and (
    p_url ~ '^https://firebasestorage\.googleapis\.com/v0/b/novotech-systems-5449b\.appspot\.com/o/'
    or p_url ~ '^https://storage\.googleapis\.com/novotech-systems-5449b\.appspot\.com/'
    or p_url ~ '^https://psfbmdfezgyruscqbqbn\.supabase\.co/storage/v1/object/public/catalog-normalized-images/'
  );
$$;

comment on column public.catalog_products.image_original_url is
  'Immutable upstream image URL from synchronized 1C catalog evidence; normalization never modifies this source.';
comment on table public.catalog_product_image_normalization_jobs is
  'Bounded asynchronous product-image normalization queue. Catalog request paths never execute image processing.';

commit;
