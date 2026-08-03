begin;

create index if not exists partner_documents_dashboard_current_idx
  on public.partner_documents(company_id, issue_date desc, published_at desc, created_at desc, id)
  where archived_at is null and status <> 'archived' and is_current;

create or replace function public.list_partner_dashboard_documents(
  p_company_id uuid,
  p_limit integer default 4
)
returns table(
  id uuid,
  document_type text,
  title text,
  document_number text,
  issue_date date,
  valid_from date,
  valid_until date,
  status text,
  version text,
  language_code text,
  file_name text,
  mime_type text,
  file_size bigint,
  is_current boolean,
  source_scope text,
  related_products jsonb,
  related_orders jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with access as (
    select
      public.has_permission(p_company_id, 'documents.view_accounting') as accounting,
      public.has_permission(p_company_id, 'documents.view_commercial') as commercial,
      public.has_permission(p_company_id, 'documents.view_product') as product
  )
  select
    document.id,
    document.document_type,
    document.title,
    document.document_number,
    document.issue_date,
    document.valid_from,
    document.valid_until,
    document.status,
    document.version,
    document.language_code,
    document.file_name,
    document.mime_type,
    document.file_size,
    document.is_current,
    case when document.company_id is null then 'product_public' else 'company_specific' end,
    '[]'::jsonb,
    '[]'::jsonb
  from public.partner_documents document
  cross join access
  where document.archived_at is null
    and document.status <> 'archived'
    and document.is_current
    and coalesce((document.safe_metadata->>'internalOnly')::boolean, false) = false
    and (document.company_id is null or document.company_id = p_company_id)
    and case public.partner_document_permission(document.document_type)
      when 'documents.view_accounting' then access.accounting
      when 'documents.view_commercial' then access.commercial
      when 'documents.view_product' then access.product
      else false
    end
  order by document.issue_date desc nulls last,
    document.published_at desc nulls last,
    document.created_at desc,
    document.id
  limit least(greatest(coalesce(p_limit, 4), 1), 8)
$$;

revoke all on function public.list_partner_dashboard_documents(uuid, integer)
  from public, anon;
grant execute on function public.list_partner_dashboard_documents(uuid, integer)
  to authenticated;

comment on function public.list_partner_dashboard_documents(uuid, integer) is
  'Bounded partner-dashboard document summaries. Permission checks are evaluated once; relation aggregates and totals remain in the full document-center read model.';

commit;
