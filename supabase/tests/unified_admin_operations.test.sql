begin;

select plan(8);

select has_table(
  'public',
  'internal_sync_action_audit_events',
  'manual sync audit table exists'
);
select row_security_is_enabled(
  'public',
  'internal_sync_action_audit_events',
  'manual sync audit uses RLS'
);
select table_privs_are(
  'public',
  'internal_sync_action_audit_events',
  'authenticated',
  array['SELECT'],
  'authenticated receives read-only table privileges'
);
select function_privs_are(
  'public',
  'record_internal_sync_action',
  array['text', 'text', 'text', 'text', 'integer'],
  'authenticated',
  array['EXECUTE'],
  'manual sync audit is written only through guarded RPC'
);
select has_function(
  'public',
  'get_admin_integration_center',
  array[]::text[],
  'integration center projection exists'
);
select has_function(
  'public',
  'list_admin_sync_jobs',
  array['text', 'text', 'text', 'timestamp with time zone', 'timestamp with time zone', 'integer', 'integer'],
  'bounded job projection exists'
);
select has_function(
  'public',
  'list_admin_integration_incidents',
  array[]::text[],
  'incident projection exists'
);
select isnt_empty(
  $$select 1 from pg_proc where proname = 'get_admin_integration_center' and prosecdef$$,
  'admin projections are permission-guarded security definer functions'
);

select * from finish();
rollback;
