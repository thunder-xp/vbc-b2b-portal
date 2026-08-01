begin;

do $$
begin
  if to_regprocedure('public.get_onboarding_request_detail_v3(uuid)') is null then
    raise exception 'get_onboarding_request_detail_v3(uuid) is required';
  end if;
end;
$$;

-- V3 delegates to V2, which idempotently creates the approval draft on first open.
-- Marking V3 STABLE forced PostgreSQL into a read-only execution context.
alter function public.get_onboarding_request_detail_v3(uuid) volatile;

comment on function public.get_onboarding_request_detail_v3(uuid) is
  'Returns the governed onboarding application detail and may initialize its idempotent approval draft.';

commit;
