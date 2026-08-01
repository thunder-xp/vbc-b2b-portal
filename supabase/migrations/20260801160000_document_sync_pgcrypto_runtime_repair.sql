begin;

do $$
begin
  if to_regprocedure('extensions.digest(text,text)') is null then
    raise exception 'pgcrypto digest(text,text) is unavailable in extensions.';
  end if;

  perform extensions.digest(
    'partner-document-sync-pgcrypto-runtime-smoke'::text,
    'sha256'::text
  );
end;
$$;

alter function public.publish_partner_document_sync(uuid)
  set search_path = public, extensions;

comment on function public.publish_partner_document_sync(uuid) is
  'Atomically publishes staged 1C document metadata. Its trusted search path includes the pgcrypto extension schema used for notification fingerprints.';

commit;
