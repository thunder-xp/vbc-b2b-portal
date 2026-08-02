begin;
create or replace function public.search_partner_service_cases(p_company_id uuid,p_query text,p_limit integer default 10)
returns table(document_type text,document_id uuid,title text,subtitle text,route text,updated_at timestamptz)
language sql stable security definer set search_path=public set row_security=off as $$
 select 'service_case',c.id,c.case_number,coalesce(p.sku||' · '||p.name,c.entered_serial_number,'Сервисная заявка'),'/cabinet/service/'||c.id::text,c.updated_at
 from public.service_cases c left join public.catalog_products p on p.id=c.product_id
 where c.company_id=p_company_id and public.has_permission(p_company_id,'service.view')
 and lower(c.case_number||' '||coalesce(p.sku,'')||' '||coalesce(p.name,'')||' '||coalesce(c.entered_serial_number,'')) like '%'||lower(btrim(p_query))||'%'
 order by c.updated_at desc,c.id limit least(greatest(p_limit,1),10)
$$;
revoke all on function public.search_partner_service_cases(uuid,text,integer) from public,anon;
grant execute on function public.search_partner_service_cases(uuid,text,integer) to authenticated;
commit;
