begin;

create table public.partner_expertise_videos (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('LAB', 'ACADEMY')),
  youtube_video_id text not null unique
    check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  youtube_url text not null unique
    check (youtube_url = 'https://www.youtube.com/watch?v=' || youtube_video_id),
  title_ru text not null check (char_length(btrim(title_ru)) between 2 and 180),
  title_ro text not null check (char_length(btrim(title_ro)) between 2 and 180),
  description_ru text not null check (char_length(btrim(description_ru)) between 2 and 1000),
  description_ro text not null check (char_length(btrim(description_ro)) between 2 and 1000),
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  sort_order integer not null default 100 check (sort_order between 0 and 10000),
  revision integer not null default 1 check (revision > 0),
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  check (
    (status = 'PUBLISHED' and published_at is not null)
    or (status <> 'PUBLISHED' and published_at is null)
  )
);

create index partner_expertise_videos_published_idx
  on public.partner_expertise_videos (section, sort_order, published_at desc, id)
  where status = 'PUBLISHED';

create index partner_expertise_videos_admin_idx
  on public.partner_expertise_videos (status, section, updated_at desc, id);

alter table public.partner_expertise_videos enable row level security;

revoke all on table public.partner_expertise_videos from public, anon, authenticated;
grant select, insert, update, delete on table public.partner_expertise_videos to service_role;

create or replace function public.list_partner_expertise_videos(
  p_company_id uuid,
  p_section text,
  p_locale text default 'ru'
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null
    or p_company_id is null
    or not public.has_active_company_membership(p_company_id) then
    raise exception 'Partner Expertise access denied.' using errcode = '42501';
  end if;
  if p_section not in ('LAB', 'ACADEMY') or p_locale not in ('ru', 'ro') then
    raise exception 'Partner Expertise list input is invalid.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', video.id,
      'section', video.section,
      'youtubeVideoId', video.youtube_video_id,
      'youtubeUrl', video.youtube_url,
      'title', case when p_locale = 'ro' then video.title_ro else video.title_ru end,
      'description', case when p_locale = 'ro' then video.description_ro else video.description_ru end,
      'publishedAt', video.published_at
    ) order by video.sort_order, video.published_at desc, video.id
  ), '[]'::jsonb)
  into result
  from (
    select *
    from public.partner_expertise_videos source
    where source.section = p_section
      and source.status = 'PUBLISHED'
      and source.published_at <= now()
    order by source.sort_order, source.published_at desc, source.id
    limit 60
  ) video;

  return result;
end;
$$;

create or replace function public.get_partner_expertise_video(
  p_company_id uuid,
  p_video_id uuid,
  p_locale text default 'ru'
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null
    or p_company_id is null
    or not public.has_active_company_membership(p_company_id) then
    raise exception 'Partner Expertise access denied.' using errcode = '42501';
  end if;
  if p_video_id is null or p_locale not in ('ru', 'ro') then
    raise exception 'Partner Expertise video input is invalid.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'id', video.id,
    'section', video.section,
    'youtubeVideoId', video.youtube_video_id,
    'youtubeUrl', video.youtube_url,
    'title', case when p_locale = 'ro' then video.title_ro else video.title_ru end,
    'description', case when p_locale = 'ro' then video.description_ro else video.description_ru end,
    'publishedAt', video.published_at
  )
  into result
  from public.partner_expertise_videos video
  where video.id = p_video_id
    and video.status = 'PUBLISHED'
    and video.published_at <= now();

  return result;
end;
$$;

create or replace function public.list_admin_partner_expertise_videos(
  p_section text default null,
  p_status text default null,
  p_limit integer default 100,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not public.has_internal_permission('content.manage') then
    raise exception 'Partner Expertise management is not allowed.' using errcode = '42501';
  end if;
  if (p_section is not null and p_section not in ('LAB', 'ACADEMY'))
    or (p_status is not null and p_status not in ('DRAFT', 'PUBLISHED', 'ARCHIVED'))
    or p_limit not between 1 and 100
    or p_offset not between 0 and 5000 then
    raise exception 'Admin Partner Expertise list input is invalid.' using errcode = '22023';
  end if;

  with filtered as (
    select video.*
    from public.partner_expertise_videos video
    where (p_section is null or video.section = p_section)
      and (p_status is null or video.status = p_status)
  ), page as (
    select *
    from filtered
    order by updated_at desc, id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', video.id,
        'section', video.section,
        'youtubeVideoId', video.youtube_video_id,
        'youtubeUrl', video.youtube_url,
        'titleRu', video.title_ru,
        'titleRo', video.title_ro,
        'descriptionRu', video.description_ru,
        'descriptionRo', video.description_ro,
        'status', video.status,
        'sortOrder', video.sort_order,
        'revision', video.revision,
        'publishedAt', video.published_at,
        'createdAt', video.created_at,
        'updatedAt', video.updated_at
      ) order by video.updated_at desc, video.id)
      from page video
    ), '[]'::jsonb),
    'total', (select count(*)::integer from filtered)
  ) into result;

  return result;
end;
$$;

create or replace function public.get_admin_partner_expertise_video(
  p_video_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not public.has_internal_permission('content.manage') then
    raise exception 'Partner Expertise management is not allowed.' using errcode = '42501';
  end if;
  if p_video_id is null then
    raise exception 'Admin Partner Expertise video input is invalid.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'id', video.id,
    'section', video.section,
    'youtubeVideoId', video.youtube_video_id,
    'youtubeUrl', video.youtube_url,
    'titleRu', video.title_ru,
    'titleRo', video.title_ro,
    'descriptionRu', video.description_ru,
    'descriptionRo', video.description_ro,
    'status', video.status,
    'sortOrder', video.sort_order,
    'revision', video.revision,
    'publishedAt', video.published_at,
    'createdAt', video.created_at,
    'updatedAt', video.updated_at
  ) into result
  from public.partner_expertise_videos video
  where video.id = p_video_id;

  return result;
end;
$$;

create or replace function public.save_admin_partner_expertise_video(
  p_video_id uuid,
  p_section text,
  p_youtube_video_id text,
  p_youtube_url text,
  p_title_ru text,
  p_title_ro text,
  p_description_ru text,
  p_description_ro text,
  p_sort_order integer,
  p_expected_revision integer
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current public.partner_expertise_videos%rowtype;
  target_id uuid;
begin
  if actor is null or not public.has_internal_permission('content.manage') then
    raise exception 'Partner Expertise management is not allowed.' using errcode = '42501';
  end if;
  if p_section is null or p_section not in ('LAB', 'ACADEMY')
    or p_youtube_video_id is null or p_youtube_video_id !~ '^[A-Za-z0-9_-]{11}$'
    or p_youtube_url is null
    or p_youtube_url <> 'https://www.youtube.com/watch?v=' || p_youtube_video_id
    or p_title_ru is null or char_length(btrim(p_title_ru)) not between 2 and 180
    or p_title_ro is null or char_length(btrim(p_title_ro)) not between 2 and 180
    or p_description_ru is null or char_length(btrim(p_description_ru)) not between 2 and 1000
    or p_description_ro is null or char_length(btrim(p_description_ro)) not between 2 and 1000
    or p_sort_order is null or p_sort_order not between 0 and 10000 then
    raise exception 'Partner Expertise video input is invalid.' using errcode = '22023';
  end if;

  if p_video_id is null then
    insert into public.partner_expertise_videos(
      section, youtube_video_id, youtube_url, title_ru, title_ro,
      description_ru, description_ro, sort_order, created_by, updated_by
    ) values (
      p_section, p_youtube_video_id, p_youtube_url, btrim(p_title_ru), btrim(p_title_ro),
      btrim(p_description_ru), btrim(p_description_ro), p_sort_order, actor, actor
    ) returning id into target_id;
    return target_id;
  end if;

  select * into current
  from public.partner_expertise_videos
  where id = p_video_id
  for update;

  if current.id is null then
    raise exception 'Partner Expertise video not found.' using errcode = 'P0002';
  end if;
  if current.revision <> p_expected_revision then
    raise exception 'PARTNER_EXPERTISE_VERSION_CONFLICT' using errcode = 'PT409';
  end if;
  if current.status = 'ARCHIVED' then
    raise exception 'PARTNER_EXPERTISE_STATE_CONFLICT' using errcode = 'PT409';
  end if;

  update public.partner_expertise_videos
  set section = p_section,
      youtube_video_id = p_youtube_video_id,
      youtube_url = p_youtube_url,
      title_ru = btrim(p_title_ru),
      title_ro = btrim(p_title_ro),
      description_ru = btrim(p_description_ru),
      description_ro = btrim(p_description_ro),
      sort_order = p_sort_order,
      status = case when status = 'PUBLISHED' then 'DRAFT' else status end,
      published_at = case when status = 'PUBLISHED' then null else published_at end,
      revision = revision + 1,
      updated_by = actor,
      updated_at = now()
  where id = p_video_id
  returning id into target_id;

  return target_id;
end;
$$;

create or replace function public.transition_admin_partner_expertise_video(
  p_video_id uuid,
  p_action text,
  p_expected_revision integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current public.partner_expertise_videos%rowtype;
  next_status text;
begin
  if actor is null or not public.has_internal_permission('content.manage') then
    raise exception 'Partner Expertise management is not allowed.' using errcode = '42501';
  end if;

  select * into current
  from public.partner_expertise_videos
  where id = p_video_id
  for update;

  if current.id is null then
    raise exception 'Partner Expertise video not found.' using errcode = 'P0002';
  end if;
  if current.revision <> p_expected_revision then
    raise exception 'PARTNER_EXPERTISE_VERSION_CONFLICT' using errcode = 'PT409';
  end if;

  if p_action = 'publish' and current.status = 'DRAFT' then
    next_status := 'PUBLISHED';
  elsif p_action = 'unpublish' and current.status = 'PUBLISHED' then
    next_status := 'DRAFT';
  elsif p_action = 'archive' and current.status in ('DRAFT', 'PUBLISHED') then
    next_status := 'ARCHIVED';
  else
    raise exception 'PARTNER_EXPERTISE_STATE_CONFLICT' using errcode = 'PT409';
  end if;

  update public.partner_expertise_videos
  set status = next_status,
      published_at = case when next_status = 'PUBLISHED' then now() else null end,
      revision = revision + 1,
      updated_by = actor,
      updated_at = now()
  where id = p_video_id;

  return jsonb_build_object('status', next_status, 'revision', current.revision + 1);
end;
$$;

revoke all on function public.list_partner_expertise_videos(uuid, text, text),
  public.get_partner_expertise_video(uuid, uuid, text),
  public.list_admin_partner_expertise_videos(text, text, integer, integer),
  public.get_admin_partner_expertise_video(uuid),
  public.save_admin_partner_expertise_video(uuid, text, text, text, text, text, text, text, integer, integer),
  public.transition_admin_partner_expertise_video(uuid, text, integer)
from public, anon, authenticated;

grant execute on function public.list_partner_expertise_videos(uuid, text, text),
  public.get_partner_expertise_video(uuid, uuid, text)
to authenticated, service_role;

grant execute on function public.list_admin_partner_expertise_videos(text, text, integer, integer),
  public.get_admin_partner_expertise_video(uuid),
  public.save_admin_partner_expertise_video(uuid, text, text, text, text, text, text, text, integer, integer),
  public.transition_admin_partner_expertise_video(uuid, text, integer)
to authenticated, service_role;

comment on table public.partner_expertise_videos is
  'Portal-owned governed Partner video content; separate from Knowledge Base and Installation Marketplace eligibility.';
comment on function public.list_partner_expertise_videos(uuid, text, text) is
  'One bounded published-only Partner Expertise query for an active Partner workspace.';
comment on function public.get_partner_expertise_video(uuid, uuid, text) is
  'One published-only Partner Expertise watch lookup for an active Partner workspace.';

commit;
