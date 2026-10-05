// Run after browser acceptance: this advances only the disposable fixture's publication.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
const proof = spawnSync(process.execPath, ['scripts/campaign-intent-validation.mjs', 'assert'], { encoding: 'utf8' });
assert.equal(proof.status, 0, 'Disposable target proof required');
const container = 'supabase_db_campaign-intent-20261004';
const campaign = 'fa510000-0000-4000-8000-000000000001';
const company = 'ba500000-0000-4000-8000-000000000001';
const actor = 'aa500000-0000-4000-8000-000000000001';
const partner = 'aa500000-0000-4000-8000-000000000002';
const guard = `do $$ begin if current_setting('intent.disposable_task',true) is distinct from
 'VBC-SPECIAL-OFFERS-CAMPAIGN-INTENT-CART-20261004' then raise exception 'Disposable target missing'; end if; end $$;`;
const auth = (id) => `select set_config('request.jwt.claim.sub','${id}',true);
 select set_config('request.jwt.claims','{"sub":"${id}","role":"authenticated"}',true);`;
function sql(text, onData) {
  const child = spawn('docker', ['exec', '-i', '-e', 'PGAPPNAME=campaign-intent-disposable', container,
    'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']);
  let output = '';
  const completion = new Promise((resolve, reject) => {
    child.stdout.on('data', (data) => { output += data; onData?.(output); });
    child.stderr.on('data', (data) => { output += data; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(`Isolated concurrent SQL failed: ${output}`)));
  });
  child.stdin.end(text);
  return completion;
}
// The row is locked before launching the competing Partner action.
let readyResolve;
const ready = new Promise((resolve) => { readyResolve = resolve; });
const publish = sql(`begin; ${guard} ${auth(actor)}
 select id from public.commercial_campaigns where id='${campaign}' and current_version=1 and status='active' for update;
 select 'PUBLICATION_LOCK_READY'; select pg_sleep(0.8);
 select public.pause_commercial_campaign('${campaign}','Disposable concurrent publication acceptance');
 select public.reopen_commercial_campaign_for_edit_v1('${campaign}','Disposable concurrent publication acceptance');
 select public.update_commercial_campaign_draft_v2('${campaign}',
   (select draft_revision from public.commercial_campaigns where id='${campaign}'),
   'fb910000-0000-4000-8000-000000000001',intent_fixture.legacy_draft('${campaign}'));
 select public.publish_commercial_campaign('${campaign}','fc910000-0000-4000-8000-000000000001'); commit;`,
 (output) => { if (output.includes('PUBLICATION_LOCK_READY')) readyResolve(); });
await Promise.race([ready, publish.then(() => { throw new Error('Publisher did not expose lock readiness'); })]);
const started = performance.now();
const add = sql(`begin; ${guard} ${auth(partner)}
 do $$ declare old_item uuid; denied boolean:=false; begin
 select (value->>'id')::uuid into old_item from public.commercial_campaign_versions v,
 lateral jsonb_array_elements(v.item_snapshot) where v.campaign_id='${campaign}' and v.version_number=1;
 begin perform public.add_commercial_campaign_item_to_cart_v2('${company}',old_item,1,1,
   'fd910000-0000-4000-8000-000000000001'); exception when sqlstate 'PT409' then denied:=true; end;
 if not denied then raise exception 'Concurrent obsolete publication accepted'; end if;
 if exists(select 1 from public.commercial_campaign_engagement_events where request_id='fd910000-0000-4000-8000-000000000001')
   then raise exception 'Rejected publication created engagement'; end if;
 end $$; rollback;`);
await Promise.all([publish, add]);
assert.ok(performance.now() - started >= 100, 'Competing action did not wait for publication lock');
console.log('PASS concurrent draft replacement/publication: obsolete action waits, fails PT409, no deadlock, no cart/event mutation.');
