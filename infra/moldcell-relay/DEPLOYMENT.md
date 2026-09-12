# Production deployment runbook

This runbook installs the relay additively on `10.0.10.120`, whose public egress is `178.168.8.4`. It does not edit `/var/www/nsd-api`, does not restart or replace PM2 process `novotech.api`, and does not call `/notification/moldcell-send/`. No command below sends an SMS.

## 1. Pre-deployment routing evidence

From the server, record the existing legacy route response without a message body:

```sh
curl --silent --show-error --output /dev/null --dump-header - \
  --request OPTIONS \
  --resolve api.novotech.systems:443:127.0.0.1 \
  https://api.novotech.systems/notification/moldcell-send/
sudo nginx -T 2>/dev/null | grep -A4 -B2 'location /'
pm2 describe novotech.api
```

`OPTIONS` carries no recipient or SMS body and is routing evidence only. Save the status/headers and `novotech.api` process identity for the post-deployment comparison.

## 2. Install Node and copy the bundle

Use Node.js 24 LTS (`>=24.2.0`, `<25`). Verify the exact runtime before copying:

```sh
node --version
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a===24&&b>=2?0:1)'
```

Run from a checked-out repository copy as the same non-root deployment account that owns its PM2 daemon:

```sh
sudo install -d -m 0750 -o "$USER" -g "$(id -gn)" /var/www/nsd-sms-relay
sudo install -d -m 0750 -o "$USER" -g "$(id -gn)" /var/lib/nsd-sms-relay
sudo install -d -m 0750 -o "$USER" -g "$(id -gn)" /var/log/nsd-sms-relay
rsync -a --exclude='.env' --exclude='node_modules' infra/moldcell-relay/ /var/www/nsd-sms-relay/
cd /var/www/nsd-sms-relay
npm ci --omit=dev
npm test
npm run check
```

The `rsync` command does not delete target files and excludes the production `.env`.

## 3. Create secrets and environment

Generate one relay secret locally on the server. Do not paste it into chat, logs, shell tracing, or source control:

```sh
umask 077
openssl rand -hex 32 > /tmp/nsd-relay-secret
test ! -e /var/www/nsd-sms-relay/.env && install -m 0600 /dev/null /var/www/nsd-sms-relay/.env
sudoedit /var/www/nsd-sms-relay/.env
```

Use `.env.example` as the key list. Insert the contents of `/tmp/nsd-relay-secret` as `RELAY_AUTH_SECRET`, then securely delete that one temporary file after the same value has been entered in the relay and Vercel secret stores:

```sh
shred -u /tmp/nsd-relay-secret
chmod 0600 /var/www/nsd-sms-relay/.env
```

`RELAY_KEY_ID` is a non-secret rotation label such as `relay-2026-09`. Do not use the secret itself as the key ID.

To migrate the provider configuration without disclosing it, inspect the old file read-only and edit only the new file on the server:

```sh
sudo less /var/www/nsd-api/.env
sudoedit /var/www/nsd-sms-relay/.env
```

Copy only the current provider/customer identifiers, GUID, sender, and template values. Do not modify the old file and do not remove any legacy value. If the old variable names differ, map their concepts manually to `MOLDCELL_PROVIDER_ID`, `MOLDCELL_CUSTOMER_ID`, `MOLDCELL_GUID`, `MOLDCELL_SENDER`, and `MOLDCELL_TEMPLATE`. The new base URL must remain `https://wsg.moldcell.md`.

Run the non-secret readiness check:

```sh
cd /var/www/nsd-sms-relay
node --env-file=.env scripts/preflight.mjs
```

It must report Node support, writable database directory, authentication configured, provider configured, and `ready: true`; it never prints credential values.

## 4. Start only the new PM2 process

```sh
cd /var/www/nsd-sms-relay
pm2 start ecosystem.config.cjs --only nsd-sms-relay
pm2 save
pm2 describe nsd-sms-relay
./scripts/health-check.sh
```

Do not run `pm2 delete all`, `pm2 restart all`, or change `novotech.api`.

Install bounded log rotation:

```sh
sudo install -m 0644 /var/www/nsd-sms-relay/logrotate.conf /etc/logrotate.d/nsd-sms-relay
sudo logrotate --debug /etc/logrotate.d/nsd-sms-relay
```

## 5. Add the exact Nginx location

Open the existing `api.novotech.systems` server block:

```sh
sudoedit /etc/nginx/sites-enabled/api.novotech.systems
```

Paste only the `location = /internal/omnichannel/v1/sms/moldcell { ... }` block from `nginx-location.conf` inside that server block. Do not replace the file and do not edit the existing `location /` proxy to `http://10.0.10.120:8080`.

Validate before reload:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

Port 8091 stays closed in UFW because the process binds only `127.0.0.1`.

## 6. No-send acceptance

Process health (no provider call):

```sh
curl --fail-with-body --silent --show-error https://api.novotech.systems/internal/omnichannel/v1/sms/moldcell \
  --request GET
```

Nginx should reject that non-POST method. Confirm localhost health separately:

```sh
curl --fail-with-body --silent --show-error http://127.0.0.1:8091/health
```

Unsigned POST must be rejected before provider access:

```sh
curl --silent --show-error --include \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{}' \
  https://api.novotech.systems/internal/omnichannel/v1/sms/moldcell
```

Expected: HTTP 401 with `AUTH_MISSING`.

The signed probe deliberately uses a valid but unsupported `+40` E.164 destination. It proves HMAC through Cloudflare/Nginx while the relay deterministically stops before Moldcell:

```sh
cd /var/www/nsd-sms-relay
RELAY_PUBLIC_URL='https://api.novotech.systems/internal/omnichannel/v1/sms/moldcell' \
node --env-file=.env scripts/signed-no-send-probe.mjs
```

Expected: `authenticated: true`, `providerAttempted: false`, and `NO_SMS_PROVIDER_FOR_DESTINATION`.

Repeat the pre-deployment legacy routing commands and compare status/headers and `pm2 describe novotech.api`. Also prove Nginx still contains both routes:

```sh
sudo nginx -T 2>/dev/null | grep -A20 -B2 '/internal/omnichannel/v1/sms/moldcell'
sudo nginx -T 2>/dev/null | grep -A4 -B2 'proxy_pass http://10.0.10.120:8080'
curl --silent --show-error --output /dev/null --dump-header - \
  --request OPTIONS \
  --resolve api.novotech.systems:443:127.0.0.1 \
  https://api.novotech.systems/notification/moldcell-send/
pm2 describe novotech.api
```

Do not perform a real relay or legacy SMS send in this task.

## 7. Vercel production relay variables

Configure these server-side variables for the existing B2B candidate:

```text
SMS_MODE=SANDBOX
MOLDCELL_TRANSPORT_MODE=relay
MOLDCELL_RELAY_URL=https://api.novotech.systems/internal/omnichannel/v1/sms/moldcell
MOLDCELL_RELAY_AUTH_SECRET=<same secret as relay RELAY_AUTH_SECRET>
MOLDCELL_RELAY_KEY_ID=<same key ID as relay RELAY_KEY_ID>
SMS_SANDBOX_ALLOWED_RECIPIENTS=<explicitly approved canonical +373 E.164 list>
```

Do not place `MOLDCELL_GUID`, `MOLDCELL_PROVIDER_ID`, or `MOLDCELL_CUSTOMER_ID` in Vercel relay mode. Keep automated SMS producers disabled. A real sandbox SMS requires a separate explicit approval and receipt-confirmation acceptance step.

## 8. Backup, rollback, and portability

Before relocating or upgrading, take a consistent online backup without revealing data:

```sh
sudo install -d -m 0700 /var/backups/nsd-sms-relay
sqlite3 /var/lib/nsd-sms-relay/relay.sqlite \
  ".backup '/var/backups/nsd-sms-relay/relay-before-move.sqlite'"
```

Rollback affects only the new route/process:

1. remove only the exact relay `location` block and run `sudo nginx -t` before reload;
2. `pm2 stop nsd-sms-relay`;
3. leave `novotech.api`, `/var/www/nsd-api`, and the legacy route untouched;
4. retain the SQLite file until the Omnichannel retry/idempotency window has expired.

Current topology is `Omnichannel -> relay -> Moldcell`. A future direct topology is `Omnichannel -> direct Moldcell transport`; it requires only direct transport configuration, provider secrets at the new runtime, and Moldcell allowlisting of that runtime's egress—no feature-module change.

Moving the relay from `178.168.8.4` requires deploying this same bundle, securely copying the provider configuration and SQLite idempotency state, allowlisting the new egress with Moldcell, and changing `MOLDCELL_RELAY_URL` only if the hostname changes. No B2B business code changes.
