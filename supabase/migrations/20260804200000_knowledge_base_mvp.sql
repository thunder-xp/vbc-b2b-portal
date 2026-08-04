begin;

insert into public.permissions(code,description,scope,delegable_by_partner_owner,sensitive,category) values
 ('knowledge.view','View published partner knowledge.','partner',true,false,'knowledge'),
 ('knowledge.create','Create knowledge articles.','internal',false,true,'knowledge'),
 ('knowledge.edit','Edit knowledge articles.','internal',false,true,'knowledge'),
 ('knowledge.review','Submit and review knowledge articles.','internal',false,true,'knowledge'),
 ('knowledge.publish','Publish knowledge articles.','internal',false,true,'knowledge'),
 ('knowledge.archive','Archive and restore knowledge articles.','internal',false,true,'knowledge'),
 ('knowledge.analytics.view','View knowledge diagnostics and analytics.','internal',false,true,'knowledge')
on conflict(code) do update set description=excluded.description,scope=excluded.scope,
 delegable_by_partner_owner=excluded.delegable_by_partner_owner,sensitive=excluded.sensitive,category=excluded.category;

with grants(role_code,permission_code) as (values
 ('partner_owner','knowledge.view'),('partner_manager','knowledge.view'),('partner_buyer','knowledge.view'),('partner_viewer','knowledge.view'),
 ('novotech_admin','knowledge.create'),('novotech_admin','knowledge.edit'),('novotech_admin','knowledge.review'),('novotech_admin','knowledge.publish'),('novotech_admin','knowledge.archive'),('novotech_admin','knowledge.analytics.view'),
 ('novotech_support','knowledge.create'),('novotech_support','knowledge.edit'),('novotech_support','knowledge.review'),('novotech_support','knowledge.analytics.view'),
 ('novotech_sales','knowledge.create'),('novotech_sales','knowledge.edit'),('novotech_sales','knowledge.review')
)
insert into public.role_permissions(role_id,permission_id)
select role.id,permission.id from grants join public.roles role on role.code=role_code join public.permissions permission on permission.code=permission_code
on conflict do nothing;

insert into public.partner_access_preset_capabilities(preset_code,permission_id)
select 'full_partner_access',id from public.permissions where code='knowledge.view' on conflict do nothing;
insert into public.partner_company_capabilities(company_id,permission_id,enabled_by)
select policy.company_id,permission.id,policy.changed_by from public.partner_company_access_policies policy
cross join public.permissions permission where policy.preset_code='full_partner_access' and permission.code='knowledge.view' on conflict do nothing;

create table public.knowledge_categories(
 id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null,
 parent_id uuid null references public.knowledge_categories(id) on delete restrict, sort_order integer not null default 0,
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(slug~'^[a-z0-9]+(?:-[a-z0-9]+)*$'), check(char_length(btrim(name)) between 2 and 120)
);

create table public.knowledge_articles(
 id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null, summary text not null,
 article_type text not null, status text not null default 'draft', visibility text not null default 'internal_only', locale text not null default 'ru',
 content_json jsonb not null default '[]'::jsonb, search_text text not null default '', featured boolean not null default false,
 published_at timestamptz null, archived_at timestamptz null, author_user_id uuid null references public.user_profiles(id) on delete set null,
 last_editor_user_id uuid null references public.user_profiles(id) on delete set null, version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(slug~'^[a-z0-9]+(?:-[a-z0-9]+)*$'), check(char_length(btrim(title)) between 3 and 240),
 check(char_length(btrim(summary)) between 10 and 600),
 check(article_type in ('article','faq','installation_guide','configuration_guide','troubleshooting','warranty_instruction','service_instruction','video_guide','release_note','product_documentation')),
 check(status in ('draft','review','published','archived')), check(visibility in ('all_partners','internal_only')),
 check(locale in ('ru','ro')), check(version>0), check(jsonb_typeof(content_json)='array'), check(pg_column_size(content_json)<=131072)
);

create table public.knowledge_article_categories(article_id uuid not null references public.knowledge_articles(id) on delete cascade,category_id uuid not null references public.knowledge_categories(id) on delete restrict,primary key(article_id,category_id));
create table public.knowledge_article_products(article_id uuid not null references public.knowledge_articles(id) on delete cascade,product_id uuid not null references public.catalog_products(id) on delete restrict,primary key(article_id,product_id));
create table public.knowledge_article_documents(article_id uuid not null references public.knowledge_articles(id) on delete cascade,document_id uuid not null references public.partner_documents(id) on delete restrict,primary key(article_id,document_id));
create table public.knowledge_article_videos(id uuid primary key default gen_random_uuid(),article_id uuid not null references public.knowledge_articles(id) on delete cascade,provider text not null,video_url text not null,title text not null,duration_seconds integer null,thumbnail_url text null,sort_order integer not null default 0,check(provider in ('youtube','vimeo','approved_external')),check(video_url~'^https://'),check(thumbnail_url is null or thumbnail_url~'^https://'),check(duration_seconds is null or duration_seconds between 1 and 86400));
create table public.knowledge_article_related(article_id uuid not null references public.knowledge_articles(id) on delete cascade,related_article_id uuid not null references public.knowledge_articles(id) on delete restrict,sort_order integer not null default 0,primary key(article_id,related_article_id),check(article_id<>related_article_id));

create table public.knowledge_article_versions(
 id uuid primary key default gen_random_uuid(),article_id uuid not null references public.knowledge_articles(id) on delete restrict,version integer not null,
 title text not null,summary text not null,article_type text not null,visibility text not null,locale text not null,content_json jsonb not null,
 created_by uuid null references public.user_profiles(id) on delete set null,created_at timestamptz not null default now(),publication_reason text null,
 unique(article_id,version),check(jsonb_typeof(content_json)='array')
);
create table public.knowledge_article_events(id uuid primary key default gen_random_uuid(),article_id uuid not null references public.knowledge_articles(id) on delete restrict,actor_user_id uuid null references public.user_profiles(id) on delete set null,event_type text not null,from_status text null,to_status text null,safe_metadata jsonb not null default '{}'::jsonb,occurred_at timestamptz not null default now(),check(event_type in ('created','updated','submitted_for_review','published','archived','restored')),check(jsonb_typeof(safe_metadata)='object'));
create table public.knowledge_article_feedback(id uuid primary key default gen_random_uuid(),article_id uuid not null references public.knowledge_articles(id) on delete restrict,article_version integer not null,user_id uuid not null references public.user_profiles(id) on delete restrict,company_id uuid not null references public.partner_companies(id) on delete restrict,helpful boolean not null,reason text null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(article_id,article_version,user_id),check(reason is null or reason in ('outdated','unclear','not_solved','missing_step','other')));
create table public.knowledge_article_views(id uuid primary key default gen_random_uuid(),article_id uuid not null references public.knowledge_articles(id) on delete restrict,article_version integer not null,user_id uuid not null references public.user_profiles(id) on delete restrict,company_id uuid not null references public.partner_companies(id) on delete restrict,route_family text not null default 'knowledge',completed boolean not null default false,viewed_at timestamptz not null default now());
create table public.knowledge_search_events(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.user_profiles(id) on delete restrict,company_id uuid not null references public.partner_companies(id) on delete restrict,query_hash text not null,normalized_length integer not null,result_count integer not null,result_article_id uuid null references public.knowledge_articles(id) on delete set null,result_rank integer null,source text not null,created_at timestamptz not null default now(),check(query_hash~'^[0-9a-f]{64}$'),check(normalized_length between 2 and 100),check(result_count between 0 and 100),check(source in ('landing','global','support','service','product')));
create table public.knowledge_ticket_suggestions(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.user_profiles(id) on delete restrict,company_id uuid not null references public.partner_companies(id) on delete restrict,article_id uuid not null references public.knowledge_articles(id) on delete restrict,article_version integer not null,source text not null,query_hash text not null,outcome text not null default 'suggested',ticket_id uuid null,created_at timestamptz not null default now(),resolved_at timestamptz null,unique(user_id,article_id,article_version,source,query_hash),check(source in ('support','service')),check(outcome in ('suggested','opened','solved','continued','ticket_created')),check(query_hash~'^[0-9a-f]{64}$'));

create index knowledge_articles_partner_idx on public.knowledge_articles(status,visibility,locale,featured,published_at desc);
create index knowledge_articles_search_idx on public.knowledge_articles using gin(to_tsvector('simple',search_text));
create index knowledge_article_categories_category_idx on public.knowledge_article_categories(category_id,article_id);
create index knowledge_article_products_product_idx on public.knowledge_article_products(product_id,article_id);
create index knowledge_article_documents_document_idx on public.knowledge_article_documents(document_id,article_id);
create index knowledge_views_article_idx on public.knowledge_article_views(article_id,viewed_at desc);
create index knowledge_feedback_article_idx on public.knowledge_article_feedback(article_id,article_version);
create index knowledge_search_created_idx on public.knowledge_search_events(created_at desc);

alter table public.knowledge_categories enable row level security; alter table public.knowledge_articles enable row level security;
alter table public.knowledge_article_categories enable row level security; alter table public.knowledge_article_products enable row level security;
alter table public.knowledge_article_documents enable row level security; alter table public.knowledge_article_videos enable row level security;
alter table public.knowledge_article_related enable row level security; alter table public.knowledge_article_versions enable row level security;
alter table public.knowledge_article_events enable row level security; alter table public.knowledge_article_feedback enable row level security;
alter table public.knowledge_article_views enable row level security; alter table public.knowledge_search_events enable row level security;
alter table public.knowledge_ticket_suggestions enable row level security;
revoke all on public.knowledge_categories,public.knowledge_articles,public.knowledge_article_categories,public.knowledge_article_products,
 public.knowledge_article_documents,public.knowledge_article_videos,public.knowledge_article_related,public.knowledge_article_versions,
 public.knowledge_article_events,public.knowledge_article_feedback,public.knowledge_article_views,public.knowledge_search_events,
 public.knowledge_ticket_suggestions from public,anon,authenticated;

create or replace function public.knowledge_content_is_safe(content jsonb) returns boolean language sql immutable set search_path=public as $$
 select jsonb_typeof(content)='array' and jsonb_array_length(content)<=100 and not exists(
  select 1 from jsonb_array_elements(content) block where jsonb_typeof(block)<>'object'
   or block->>'type' not in ('heading','paragraph','ordered_list','unordered_list','callout','warning','steps','image','video','product','document','download','related_article','support_cta')
   or block::text~*'<\s*(script|iframe|object|embed|style)|javascript\s*:'
 )
$$;
alter table public.knowledge_articles add constraint knowledge_articles_safe_content check(public.knowledge_content_is_safe(content_json));
alter table public.knowledge_article_versions add constraint knowledge_versions_safe_content check(public.knowledge_content_is_safe(content_json));

create or replace function public.prevent_knowledge_history_mutation() returns trigger language plpgsql security definer set search_path=public as $$ begin raise exception 'Knowledge history is append-only.' using errcode='42501'; end $$;
create trigger knowledge_versions_immutable before update or delete on public.knowledge_article_versions for each row execute function public.prevent_knowledge_history_mutation();
create trigger knowledge_events_immutable before update or delete on public.knowledge_article_events for each row execute function public.prevent_knowledge_history_mutation();
revoke all on function public.prevent_knowledge_history_mutation() from public,anon,authenticated;

create or replace function public.can_view_knowledge_article(p_company_id uuid,p_article_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.has_permission(p_company_id,'knowledge.view') and exists(select 1 from public.knowledge_articles where id=p_article_id and status='published' and visibility='all_partners' and published_at<=now())
$$;

create or replace function public.get_partner_knowledge_landing(p_company_id uuid,p_locale text default 'ru') returns jsonb language sql stable security definer set search_path=public as $$
 select case when public.has_permission(p_company_id,'knowledge.view') then jsonb_build_object(
  'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug,'name',c.name,'articleCount',(select count(*) from public.knowledge_article_categories ac join public.knowledge_articles a on a.id=ac.article_id where ac.category_id=c.id and public.can_view_knowledge_article(p_company_id,a.id))) order by c.sort_order,c.name) from public.knowledge_categories c where c.is_active and exists(select 1 from public.knowledge_article_categories ac join public.knowledge_articles a on a.id=ac.article_id where ac.category_id=c.id and public.can_view_knowledge_article(p_company_id,a.id))),'[]'::jsonb),
  'featured',coalesce((select jsonb_agg(row_data order by featured desc,published_at desc) from (select a.featured,a.published_at,jsonb_build_object('id',a.id,'slug',a.slug,'title',a.title,'summary',a.summary,'articleType',a.article_type,'updatedAt',a.updated_at,'category',(select c.name from public.knowledge_article_categories ac join public.knowledge_categories c on c.id=ac.category_id where ac.article_id=a.id order by c.sort_order limit 1)) row_data from public.knowledge_articles a where public.can_view_knowledge_article(p_company_id,a.id) and a.locale=p_locale and a.featured order by a.published_at desc limit 6) q),'[]'::jsonb),
  'recent',coalesce((select jsonb_agg(row_data order by updated_at desc) from (select a.updated_at,jsonb_build_object('id',a.id,'slug',a.slug,'title',a.title,'summary',a.summary,'articleType',a.article_type,'updatedAt',a.updated_at,'category',(select c.name from public.knowledge_article_categories ac join public.knowledge_categories c on c.id=ac.category_id where ac.article_id=a.id order by c.sort_order limit 1)) row_data from public.knowledge_articles a where public.can_view_knowledge_article(p_company_id,a.id) and a.locale=p_locale order by a.updated_at desc limit 8) q),'[]'::jsonb)
 ) else null end
$$;

create or replace function public.search_partner_knowledge(p_company_id uuid,p_query text,p_limit integer default 10,p_source text default 'landing')
returns table(document_type text,document_id uuid,title text,subtitle text,safe_metadata jsonb,route text,updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare q text:=lower(regexp_replace(btrim(coalesce(p_query,'')),'\s+',' ','g')); capped integer:=least(greatest(coalesce(p_limit,10),1),20); result_count integer;
begin
 if char_length(q) not between 2 and 100 or not public.has_permission(p_company_id,'knowledge.view') then return; end if;
 return query with matches as (
  select a.*,case when lower(a.title)=q then 0 when lower(a.title) like q||'%' then 1 else 2 end rank
  from public.knowledge_articles a where public.can_view_knowledge_article(p_company_id,a.id)
   and (lower(a.search_text) like '%'||q||'%' or to_tsvector('simple',a.search_text)@@plainto_tsquery('simple',q)
    or exists(select 1 from public.knowledge_article_categories ac join public.knowledge_categories c on c.id=ac.category_id where ac.article_id=a.id and lower(c.name) like '%'||q||'%')
    or exists(select 1 from public.knowledge_article_products ap join public.catalog_products p on p.id=ap.product_id where ap.article_id=a.id and p.is_active and p.is_visible and lower(p.sku||' '||p.name) like '%'||q||'%')
    or exists(select 1 from public.knowledge_article_documents ad join public.partner_documents d on d.id=ad.document_id where ad.article_id=a.id and public.can_access_partner_document(d.id,p_company_id,false) and lower(d.title) like '%'||q||'%'))
  order by rank,a.updated_at desc,a.id limit capped
 ) select 'knowledge',m.id,m.title,concat_ws(' · ',(select c.name from public.knowledge_article_categories ac join public.knowledge_categories c on c.id=ac.category_id where ac.article_id=m.id order by c.sort_order limit 1),m.summary),jsonb_build_object('articleType',m.article_type,'version',m.version),'/cabinet/knowledge/'||m.slug,m.updated_at from matches m;
 get diagnostics result_count=row_count;
 insert into public.knowledge_search_events(user_id,company_id,query_hash,normalized_length,result_count,source)
 values(auth.uid(),p_company_id,encode(extensions.digest(q,'sha256'),'hex'),char_length(q),result_count,case when p_source in ('landing','global','support','service','product') then p_source else 'landing' end);
end $$;

create or replace function public.get_partner_knowledge_article(p_company_id uuid,p_slug text) returns jsonb language sql stable security definer set search_path=public as $$
 select case when public.can_view_knowledge_article(p_company_id,a.id) then jsonb_build_object(
  'id',a.id,'slug',a.slug,'title',a.title,'summary',a.summary,'articleType',a.article_type,'locale',a.locale,'content',a.content_json,'version',a.version,'updatedAt',a.updated_at,
  'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug,'name',c.name) order by c.sort_order,c.name) from public.knowledge_article_categories ac join public.knowledge_categories c on c.id=ac.category_id where ac.article_id=a.id),'[]'::jsonb),
  'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'sku',p.sku,'name',p.name,'slug',p.slug,'imageUrl',p.image_url) order by p.name) from public.knowledge_article_products ap join public.catalog_products p on p.id=ap.product_id where ap.article_id=a.id and p.is_active and p.is_visible),'[]'::jsonb),
  'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'documentType',d.document_type,'route','/cabinet/documents/'||d.id) order by d.title) from public.knowledge_article_documents ad join public.partner_documents d on d.id=ad.document_id where ad.article_id=a.id and public.can_access_partner_document(d.id,p_company_id,false)),'[]'::jsonb),
  'videos',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'provider',v.provider,'url',v.video_url,'title',v.title,'durationSeconds',v.duration_seconds,'thumbnailUrl',v.thumbnail_url) order by v.sort_order,v.id) from public.knowledge_article_videos v where v.article_id=a.id),'[]'::jsonb),
  'related',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'slug',r.slug,'title',r.title,'summary',r.summary) order by ar.sort_order,r.title) from public.knowledge_article_related ar join public.knowledge_articles r on r.id=ar.related_article_id where ar.article_id=a.id and public.can_view_knowledge_article(p_company_id,r.id)),'[]'::jsonb)
 ) else null end from public.knowledge_articles a where a.slug=p_slug
$$;

create or replace function public.list_product_knowledge(p_company_id uuid,p_product_id uuid,p_limit integer default 3) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'slug',q.slug,'title',q.title,'summary',q.summary,'articleType',q.article_type) order by q.featured desc,q.updated_at desc),'[]'::jsonb)
 from (select a.* from public.knowledge_article_products ap join public.knowledge_articles a on a.id=ap.article_id where ap.product_id=p_product_id and public.can_view_knowledge_article(p_company_id,a.id) order by a.featured desc,a.updated_at desc limit least(greatest(p_limit,1),3)) q
$$;

create or replace function public.record_knowledge_article_view(p_company_id uuid,p_article_id uuid,p_completed boolean default false) returns void language plpgsql security definer set search_path=public as $$
declare article_version integer; begin if not public.can_view_knowledge_article(p_company_id,p_article_id) then raise exception 'Article unavailable.' using errcode='42501'; end if; select version into article_version from public.knowledge_articles where id=p_article_id; insert into public.knowledge_article_views(article_id,article_version,user_id,company_id,completed) values(p_article_id,article_version,auth.uid(),p_company_id,p_completed); end $$;
create or replace function public.record_knowledge_feedback(p_company_id uuid,p_article_id uuid,p_helpful boolean,p_reason text default null) returns void language plpgsql security definer set search_path=public as $$
declare article_version integer; begin if not public.can_view_knowledge_article(p_company_id,p_article_id) then raise exception 'Article unavailable.' using errcode='42501'; end if; if p_helpful and p_reason is not null or not p_helpful and p_reason is not null and p_reason not in ('outdated','unclear','not_solved','missing_step','other') then raise exception 'Invalid feedback.' using errcode='23514'; end if; select version into article_version from public.knowledge_articles where id=p_article_id; insert into public.knowledge_article_feedback(article_id,article_version,user_id,company_id,helpful,reason) values(p_article_id,article_version,auth.uid(),p_company_id,p_helpful,p_reason) on conflict(article_id,article_version,user_id) do update set helpful=excluded.helpful,reason=excluded.reason,updated_at=now(); end $$;

create or replace function public.record_knowledge_suggestion_outcome(p_company_id uuid,p_article_id uuid,p_query_hash text,p_source text,p_outcome text) returns void language plpgsql security definer set search_path=public as $$
declare article_version integer; begin if not public.can_view_knowledge_article(p_company_id,p_article_id) or p_source not in ('support','service') or p_outcome not in ('suggested','opened','solved','continued','ticket_created') or p_query_hash!~'^[0-9a-f]{64}$' then raise exception 'Invalid suggestion event.' using errcode='23514'; end if; select version into article_version from public.knowledge_articles where id=p_article_id; insert into public.knowledge_ticket_suggestions(user_id,company_id,article_id,article_version,source,query_hash,outcome,resolved_at) values(auth.uid(),p_company_id,p_article_id,article_version,p_source,p_query_hash,p_outcome,case when p_outcome='solved' then now() end) on conflict(user_id,article_id,article_version,source,query_hash) do update set outcome=excluded.outcome,resolved_at=coalesce(excluded.resolved_at,knowledge_ticket_suggestions.resolved_at); end $$;

create or replace function public.list_admin_knowledge_articles(p_status text default null,p_query text default '',p_limit integer default 30,p_offset integer default 0) returns jsonb language sql stable security definer set search_path=public as $$
 select case when public.has_internal_permission('knowledge.edit') or public.has_internal_permission('knowledge.analytics.view') then jsonb_build_object(
  'items',coalesce(jsonb_agg(jsonb_build_object('id',a.id,'slug',a.slug,'title',a.title,'summary',a.summary,'articleType',a.article_type,'status',a.status,'visibility',a.visibility,'version',a.version,'featured',a.featured,'updatedAt',a.updated_at,'category',(select c.name from public.knowledge_article_categories ac join public.knowledge_categories c on c.id=ac.category_id where ac.article_id=a.id order by c.sort_order limit 1)) order by a.updated_at desc,a.id) filter(where a.id is not null),'[]'::jsonb),
  'total',coalesce(max(a.total_count),0)
 ) else null end from (select article.*,count(*)over() total_count from public.knowledge_articles article where (p_status is null or article.status=p_status) and (btrim(p_query)='' or lower(article.title||' '||article.summary) like '%'||lower(btrim(p_query))||'%') order by article.updated_at desc,article.id limit least(greatest(p_limit,1),100) offset greatest(p_offset,0)) a
$$;

create or replace function public.get_admin_knowledge_article(p_article_id uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select case when public.has_internal_permission('knowledge.edit') then to_jsonb(a)||jsonb_build_object('categoryIds',coalesce((select jsonb_agg(category_id) from public.knowledge_article_categories where article_id=a.id),'[]'::jsonb),'productIds',coalesce((select jsonb_agg(product_id) from public.knowledge_article_products where article_id=a.id),'[]'::jsonb),'documentIds',coalesce((select jsonb_agg(document_id) from public.knowledge_article_documents where article_id=a.id),'[]'::jsonb),'versions',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'version',v.version,'createdAt',v.created_at,'reason',v.publication_reason) order by v.version desc) from public.knowledge_article_versions v where v.article_id=a.id),'[]'::jsonb)) else null end from public.knowledge_articles a where a.id=p_article_id
$$;

create or replace function public.get_knowledge_editor_options() returns jsonb language sql stable security definer set search_path=public as $$
 select case when public.has_internal_permission('knowledge.edit') or public.has_internal_permission('knowledge.create') then jsonb_build_object(
  'categories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by sort_order,name) from public.knowledge_categories where is_active),'[]'::jsonb),
  'products',coalesce((select jsonb_agg(jsonb_build_object('id',id,'sku',sku,'name',name) order by name) from (select id,sku,name from public.catalog_products where is_active and is_visible order by name limit 100) p),'[]'::jsonb),
  'documents',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'documentType',document_type) order by title) from (select id,title,document_type from public.partner_documents where company_id is null and archived_at is null and status='available' order by updated_at desc limit 100) d),'[]'::jsonb)
 ) else null end
$$;

create or replace function public.save_knowledge_article(p_article_id uuid,p_slug text,p_title text,p_summary text,p_article_type text,p_visibility text,p_locale text,p_content jsonb,p_featured boolean,p_category_ids uuid[],p_product_ids uuid[] default '{}'::uuid[],p_document_ids uuid[] default '{}'::uuid[],p_expected_version integer default null) returns uuid language plpgsql security definer set search_path=public as $$
declare target uuid:=coalesce(p_article_id,gen_random_uuid()); actor uuid:=auth.uid(); current_version integer;
begin
 if actor is null or not public.has_internal_permission(case when p_article_id is null then 'knowledge.create' else 'knowledge.edit' end) then raise exception 'Forbidden' using errcode='42501'; end if;
 if not public.knowledge_content_is_safe(p_content) or p_slug!~'^[a-z0-9]+(?:-[a-z0-9]+)*$' or coalesce(cardinality(p_category_ids),0) not between 1 and 5 then raise exception 'Invalid article.' using errcode='23514'; end if;
 if p_article_id is null then
  insert into public.knowledge_articles(id,slug,title,summary,article_type,visibility,locale,content_json,search_text,featured,author_user_id,last_editor_user_id)
  values(target,p_slug,btrim(p_title),btrim(p_summary),p_article_type,p_visibility,p_locale,p_content,lower(p_title||' '||p_summary||' '||p_content::text),p_featured,actor,actor);
  insert into public.knowledge_article_events(article_id,actor_user_id,event_type,to_status) values(target,actor,'created','draft');
 else
  select version into current_version from public.knowledge_articles where id=target for update;
  if current_version is null or current_version<>p_expected_version then raise exception 'Article changed.' using errcode='40001'; end if;
  update public.knowledge_articles set slug=p_slug,title=btrim(p_title),summary=btrim(p_summary),article_type=p_article_type,visibility=p_visibility,locale=p_locale,content_json=p_content,search_text=lower(p_title||' '||p_summary||' '||p_content::text),featured=p_featured,last_editor_user_id=actor,version=version+1,updated_at=now() where id=target and status in ('draft','review');
  if not found then raise exception 'Published articles require a new draft.' using errcode='23514'; end if;
  insert into public.knowledge_article_events(article_id,actor_user_id,event_type,safe_metadata) values(target,actor,'updated',jsonb_build_object('previousVersion',current_version));
 end if;
 delete from public.knowledge_article_categories where article_id=target;
 insert into public.knowledge_article_categories(article_id,category_id) select target,id from public.knowledge_categories where id=any(p_category_ids) and is_active;
 if (select count(*) from public.knowledge_article_categories where article_id=target)<>cardinality(p_category_ids) then raise exception 'Invalid category.' using errcode='23514'; end if;
 delete from public.knowledge_article_products where article_id=target;
 insert into public.knowledge_article_products(article_id,product_id) select target,id from public.catalog_products where id=any(coalesce(p_product_ids,'{}'::uuid[])) and is_active and is_visible;
 if (select count(*) from public.knowledge_article_products where article_id=target)<>coalesce(cardinality(p_product_ids),0) then raise exception 'Invalid product link.' using errcode='23514'; end if;
 delete from public.knowledge_article_documents where article_id=target;
 insert into public.knowledge_article_documents(article_id,document_id) select target,id from public.partner_documents where id=any(coalesce(p_document_ids,'{}'::uuid[])) and company_id is null and archived_at is null and status='available';
 if (select count(*) from public.knowledge_article_documents where article_id=target)<>coalesce(cardinality(p_document_ids),0) then raise exception 'Invalid document link.' using errcode='23514'; end if;
 return target;
end $$;

create or replace function public.transition_knowledge_article(p_article_id uuid,p_action text,p_expected_version integer,p_reason text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.knowledge_articles; actor uuid:=auth.uid(); next_status text; event_name text;
begin
 select * into a from public.knowledge_articles where id=p_article_id for update;
 if a.id is null or a.version<>p_expected_version then raise exception 'Article changed.' using errcode='40001'; end if;
 if p_action='submit_review' and a.status='draft' and public.has_internal_permission('knowledge.review') then next_status:='review';event_name:='submitted_for_review';
 elsif p_action='publish' and a.status='review' and public.has_internal_permission('knowledge.publish') then next_status:='published';event_name:='published';
 elsif p_action='archive' and a.status='published' and public.has_internal_permission('knowledge.archive') then next_status:='archived';event_name:='archived';
 elsif p_action='restore' and a.status='archived' and public.has_internal_permission('knowledge.archive') then next_status:='draft';event_name:='restored';
 else raise exception 'Invalid knowledge transition.' using errcode='42501'; end if;
 update public.knowledge_articles set status=next_status,version=version+1,updated_at=now(),last_editor_user_id=actor,published_at=case when next_status='published' then now() else published_at end,archived_at=case when next_status='archived' then now() when next_status='draft' then null else archived_at end where id=a.id;
 if next_status='published' then insert into public.knowledge_article_versions(article_id,version,title,summary,article_type,visibility,locale,content_json,created_by,publication_reason) values(a.id,a.version+1,a.title,a.summary,a.article_type,a.visibility,a.locale,a.content_json,actor,left(nullif(btrim(p_reason),''),500)); end if;
 insert into public.knowledge_article_events(article_id,actor_user_id,event_type,from_status,to_status,safe_metadata) values(a.id,actor,event_name,a.status,next_status,case when p_reason is null then '{}'::jsonb else jsonb_build_object('reason',left(p_reason,500)) end);
 return jsonb_build_object('id',a.id,'status',next_status,'version',a.version+1);
end $$;

create or replace function public.get_knowledge_diagnostics() returns jsonb language sql stable security definer set search_path=public as $$
 select case when public.has_internal_permission('knowledge.analytics.view') then jsonb_build_object(
  'totalArticles',count(*),'drafts',count(*)filter(where status='draft'),'inReview',count(*)filter(where status='review'),'published',count(*)filter(where status='published'),'archived',count(*)filter(where status='archived'),
  'missingCategory',count(*)filter(where not exists(select 1 from public.knowledge_article_categories ac where ac.article_id=a.id)),'missingOwner',count(*)filter(where author_user_id is null),
  'outdated',count(*)filter(where status='published' and updated_at<now()-interval '180 days'),
  'brokenProductLinks',(select count(*) from public.knowledge_article_products ap left join public.catalog_products p on p.id=ap.product_id where p.id is null or not p.is_active or not p.is_visible),
  'brokenDocumentLinks',(select count(*) from public.knowledge_article_documents ad left join public.partner_documents d on d.id=ad.document_id where d.id is null or d.archived_at is not null),
  'feedbackVolume',(select count(*) from public.knowledge_article_feedback),'helpfulnessRatio',(select round(100.0*count(*)filter(where helpful)/nullif(count(*),0),1) from public.knowledge_article_feedback),
  'ticketAfterReadRatio',(select round(100.0*count(*)filter(where outcome='ticket_created')/nullif(count(*),0),1) from public.knowledge_ticket_suggestions),'latestIndexBuild',max(updated_at)
 ) else null end from public.knowledge_articles a
$$;

insert into public.knowledge_categories(slug,name,sort_order) values
 ('platform','Работа с платформой',10),('catalog-products','Каталог и товары',20),('prices-stock','Цены и наличие',30),('cart-orders','Корзина и заказы',40),('finance-documents','Финансы и документы',50),('it-support','IT-поддержка',60),('service-warranty','Сервис и гарантия',70),('installation','Установка и настройка',80),('video-surveillance','Видеонаблюдение',90),('networks','Сети',100),('access-control','Контроль доступа',110),('alarm','Сигнализация',120),('general','Общие вопросы',130)
on conflict(slug) do update set name=excluded.name,sort_order=excluded.sort_order,is_active=true;

with seed(slug,title,summary,article_type,category_slug,featured,content) as (values
 ('kak-oformit-zakaz','Как оформить заказ','Пошаговая проверка корзины и отправка заказа в обработку Novotech.','article','cart-orders',true,jsonb_build_array(jsonb_build_object('type','heading','text','Подготовьте корзину'),jsonb_build_object('type','paragraph','text','Добавьте товары из каталога, проверьте количество, актуальную цену и состояние наличия каждой позиции.'),jsonb_build_object('type','steps','items',jsonb_build_array('Откройте корзину и проверьте состав заказа.','Укажите требуемую дату отгрузки.','Проверьте итог и предупреждения по наличию.','Нажмите «Отправить заказ» один раз.')),jsonb_build_object('type','callout','text','Заказ передаётся в 1С Novotech. После обработки его статус появится в разделе «Заказы».'),jsonb_build_object('type','support_cta','target','support','text','Если заказ не отправляется, сохраните корзину и создайте заявку в IT-поддержку.'))),
 ('chto-oznachaet-cena-utochnyaetsya','Что означает «Цена уточняется»','Почему отдельная цена может быть временно недоступна и что делать партнёру.','faq','prices-stock',true,jsonb_build_array(jsonb_build_object('type','paragraph','text','Сообщение означает, что для товара нет подтверждённой цены, доступной вашему партнёрскому статусу.'),jsonb_build_object('type','warning','text','Не используйте неподтверждённую цену в заказе или коммерческом предложении.'),jsonb_build_object('type','steps','items',jsonb_build_array('Обновите страницу позднее.','Проверьте, доступна ли розничная цена.','Если цена нужна срочно, обратитесь к менеджеру или в IT-поддержку.')))),
 ('chto-oznachaet-nalichie-utochnyaetsya','Что означает «Наличие уточняется»','Как читать состояние остатков и ожидаемых поступлений в каталоге.','faq','prices-stock',false,jsonb_build_array(jsonb_build_object('type','paragraph','text','Такой статус показывается, когда подтверждённый остаток для товара временно недоступен.'),jsonb_build_object('type','paragraph','text','Дата ожидаемого поступления отображается только при наличии подтверждённых данных поставщика.'),jsonb_build_object('type','warning','text','Не считайте товар доступным до подтверждения менеджером.'))),
 ('kak-sozdat-zayavku-it-support','Как создать заявку в IT-поддержку','Какие сведения помогут быстрее решить вопрос по работе партнёрского кабинета.','troubleshooting','it-support',true,jsonb_build_array(jsonb_build_object('type','heading','text','Перед отправкой'),jsonb_build_object('type','unordered_list','items',jsonb_build_array('Опишите ожидаемый и фактический результат.','Укажите раздел кабинета, где возникла проблема.','Приложите снимок экрана без паролей и конфиденциальных данных.')),jsonb_build_object('type','steps','items',jsonb_build_array('Откройте «Гарантия и техподдержка» → «IT-поддержка».','Нажмите «Создать заявку».','Опишите проблему и выберите приоритет.','Отправьте форму.')),jsonb_build_object('type','support_cta','target','support','text','Перейти к созданию заявки.'))),
 ('kak-oformit-servisnuyu-zayavku','Как оформить сервисную заявку','Подготовьте товар, заказ и описание неисправности для сервисного центра.','service_instruction','service-warranty',true,jsonb_build_array(jsonb_build_object('type','paragraph','text','Сервисная заявка нужна для диагностики, ремонта, возврата или консультации по оборудованию.'),jsonb_build_object('type','steps','items',jsonb_build_array('Выберите тип обращения.','Привяжите заказ и товар, если они доступны.','Укажите серийный номер и признаки неисправности.','Подтвердите согласие на обработку диагностических материалов.','Отправьте заявку и следите за статусом в кабинете.')),jsonb_build_object('type','warning','text','Решение о гарантии или замене принимается после проверки Novotech.'),jsonb_build_object('type','support_cta','target','service','text','Перейти к сервисной заявке.')))
), inserted as (
 insert into public.knowledge_articles(slug,title,summary,article_type,status,visibility,locale,content_json,search_text,featured,published_at)
 select slug,title,summary,article_type,'published','all_partners','ru',content,lower(title||' '||summary||' '||content::text),featured,now() from seed
 on conflict(slug) do nothing returning id,slug,title,summary,article_type,visibility,locale,content_json,version
)
insert into public.knowledge_article_versions(article_id,version,title,summary,article_type,visibility,locale,content_json,publication_reason)
select id,version,title,summary,article_type,visibility,locale,content_json,'Контролируемый начальный набор: проверено для текущих процессов платформы.' from inserted;

insert into public.knowledge_article_categories(article_id,category_id)
select article.id,category.id from public.knowledge_articles article join (values
 ('kak-oformit-zakaz','cart-orders'),('chto-oznachaet-cena-utochnyaetsya','prices-stock'),('chto-oznachaet-nalichie-utochnyaetsya','prices-stock'),('kak-sozdat-zayavku-it-support','it-support'),('kak-oformit-servisnuyu-zayavku','service-warranty')
) mapping(article_slug,category_slug) on mapping.article_slug=article.slug join public.knowledge_categories category on category.slug=mapping.category_slug on conflict do nothing;
insert into public.knowledge_article_events(article_id,event_type,to_status,safe_metadata)
select id,'published','published',jsonb_build_object('source','controlled_initial_content') from public.knowledge_articles where slug in ('kak-oformit-zakaz','chto-oznachaet-cena-utochnyaetsya','chto-oznachaet-nalichie-utochnyaetsya','kak-sozdat-zayavku-it-support','kak-oformit-servisnuyu-zayavku') and not exists(select 1 from public.knowledge_article_events e where e.article_id=knowledge_articles.id and e.event_type='published');

revoke all on function public.knowledge_content_is_safe(jsonb),public.can_view_knowledge_article(uuid,uuid),public.get_partner_knowledge_landing(uuid,text),public.search_partner_knowledge(uuid,text,integer,text),public.get_partner_knowledge_article(uuid,text),public.list_product_knowledge(uuid,uuid,integer),public.record_knowledge_article_view(uuid,uuid,boolean),public.record_knowledge_feedback(uuid,uuid,boolean,text),public.record_knowledge_suggestion_outcome(uuid,uuid,text,text,text),public.list_admin_knowledge_articles(text,text,integer,integer),public.get_admin_knowledge_article(uuid),public.get_knowledge_editor_options(),public.save_knowledge_article(uuid,text,text,text,text,text,text,jsonb,boolean,uuid[],uuid[],uuid[],integer),public.transition_knowledge_article(uuid,text,integer,text),public.get_knowledge_diagnostics() from public,anon;
grant execute on function public.can_view_knowledge_article(uuid,uuid),public.get_partner_knowledge_landing(uuid,text),public.search_partner_knowledge(uuid,text,integer,text),public.get_partner_knowledge_article(uuid,text),public.list_product_knowledge(uuid,uuid,integer),public.record_knowledge_article_view(uuid,uuid,boolean),public.record_knowledge_feedback(uuid,uuid,boolean,text),public.record_knowledge_suggestion_outcome(uuid,uuid,text,text,text),public.list_admin_knowledge_articles(text,text,integer,integer),public.get_admin_knowledge_article(uuid),public.get_knowledge_editor_options(),public.save_knowledge_article(uuid,text,text,text,text,text,text,jsonb,boolean,uuid[],uuid[],uuid[],integer),public.transition_knowledge_article(uuid,text,integer,text),public.get_knowledge_diagnostics() to authenticated;

commit;
