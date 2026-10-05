// Destructive acceptance is confined to this task-owned disposable Supabase project.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workdir = join(root, '.codex', 'intent-validation');
const project = 'campaign-intent-20261004';
const container = `supabase_db_${project}`;
const config = `project_id = "${project}"
[api]
enabled = true
port = 55381
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000
[db]
port = 55382
shadow_port = 55380
major_version = 17
[db.seed]
enabled = false
[studio]
enabled = false
port = 55383
[inbucket]
enabled = true
port = 55384
smtp_port = 55385
pop3_port = 55386
[auth]
enabled = true
site_url = "http://localhost:3108"
additional_redirect_urls = ["http://localhost:3108/**"]
[auth.email]
enable_signup = true
enable_confirmations = false
[analytics]
enabled = false
[edge_runtime]
enabled = false
`;
const taskId = 'VBC-SPECIAL-OFFERS-CAMPAIGN-INTENT-CART-20261004';
const marker = `${taskId} disposable only\n`;
const command = process.argv[2];
if (!['prepare', 'start', 'replay', 'assert'].includes(command) || process.argv.length !== 3) {
  throw new Error('Use prepare/start/replay/assert; arbitrary URLs, projects and CLI flags are forbidden.');
}
if (command === 'prepare') {
  mkdirSync(join(workdir, 'supabase', 'migrations'), { recursive: true });
  const configPath = join(workdir, 'supabase', 'config.toml');
  if (existsSync(configPath) && readFileSync(configPath, 'utf8') !== config) throw new Error('Existing config differs; refusing overwrite.');
  writeFileSync(configPath, config);
  writeFileSync(join(workdir, 'DISPOSABLE'), marker);
  for (const filename of readdirSync(join(root, 'supabase', 'migrations'))) {
    if (filename.endsWith('.sql')) copyFileSync(join(root, 'supabase', 'migrations', filename), join(workdir, 'supabase', 'migrations', filename));
  }
}
if (realpathSync(workdir) !== workdir || readFileSync(join(workdir, 'DISPOSABLE'), 'utf8') !== marker ||
    readFileSync(join(workdir, 'supabase', 'config.toml'), 'utf8') !== config ||
    existsSync(join(workdir, 'supabase', '.temp', 'project-ref'))) {
  throw new Error('Isolation cannot be proven. Refusing command.');
}
if (command === 'prepare') { console.log(`Prepared disposable ${project}: API 55381 / DB 55382.`); process.exit(0); }
function dockerInfo(name) {
  const result = spawnSync('docker', ['inspect', name], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Expected container missing: ${name}`);
  return JSON.parse(result.stdout)[0];
}
const sharedBefore = dockerInfo('supabase_db_vbc-b2b-portal').Id;
function assertContainer() {
  const info = dockerInfo(container);
  const binding = info.NetworkSettings.Ports['5432/tcp'];
  if (info.Config.Labels['com.supabase.cli.project'] !== project ||
      info.Config.Labels['com.supabase.cli.workdir'] !== workdir ||
      !binding?.length || binding.some((port) => port.HostPort !== '55382') ||
      !info.Mounts.some((mount) => mount.Name === container)) {
    throw new Error('Container identity, workdir, volume or port mismatch. Refusing destructive acceptance.');
  }
}
function markDatabase() {
  assertContainer();
  const result = spawnSync('docker', ['exec', container, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
    '-c', `alter database postgres set intent.disposable_task='${taskId}'`], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Disposable database marker failed.');
}
if (command !== 'start') assertContainer();
if (command === 'assert') {
  const markerResult = spawnSync('docker', ['exec', container, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-At',
    '-c', "select current_setting('intent.disposable_task',true)"], { encoding: 'utf8' });
  if (markerResult.status !== 0 || markerResult.stdout.trim() !== taskId) throw new Error('Disposable database marker missing.');
  console.log(`Isolation proven: ${container}, DB 55382, unlinked.`); process.exit(0);
}
const args = command === 'start'
  ? ['supabase', 'start', '--exclude', 'studio,postgres-meta,edge-runtime,logflare,vector,supavisor,imgproxy,realtime,storage-api']
  : ['supabase', 'db', 'reset', '--local', '--no-seed', '--yes'];
// No --db-url or --linked path exists. Exact task project/config is checked above.
const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', [...args, '--workdir', workdir],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
if (dockerInfo('supabase_db_vbc-b2b-portal').Id !== sharedBefore) throw new Error('Shared container changed unexpectedly. Stop immediately.');
if (result.status === 0) markDatabase();
process.exit(result.status ?? 1);
