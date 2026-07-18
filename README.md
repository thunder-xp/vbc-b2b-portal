# Novotech Systems B2B Partner Platform

Partner-facing B2B portal for Novotech Systems distribution business.

This project is separate from the Engineering CRM project. It is designed as a partner portal, cache layer, access-control layer, order creation layer, and automation layer around 1C.

## Core Principles

- 1C is the source of truth for products, prices, stock, partners, documents, orders, invoices, debts, and credit limits.
- The portal may write to 1C only for new orders and product reservations in the MVP.
- Partner access depth is assigned manually by Novotech managers and administrators.
- A partner company may have multiple users.
- A user belongs to only one partner company.
- Different partner companies may see different information based on their assigned access profile.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase
- Vercel
- GitHub
- Future 1C API integration

## Project Structure

- `docs/` - architecture, roadmap, and development rules.
- `src/lib/supabase` - future Supabase client and server helpers.
- `src/lib/onec` - future 1C integration boundary.
- `src/lib/auth` - future authentication helpers.
- `src/lib/access` - future access-control helpers.
- `src/modules/*` - feature domains for catalog, orders, partners, pricing, inventory, documents, and admin.
- `src/types` - shared TypeScript types.

## Documentation

- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `docs/DEVELOPMENT_RULES.md`

## Development

Install dependencies and run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Local Environment

Create a local `.env.local` file for development. Do not commit this file.

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are safe for browser use. `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be imported into Client Components, browser utilities, or exposed through API responses.

### Development Test Mode

Development Test Mode lets a configured local user exercise the internal partner approval flow without permanently changing database roles.

It works only when both conditions are true:

- `NODE_ENV=development`
- `DEV_TEST_MODE=true`

Example `.env.local`:

```bash
DEV_TEST_MODE=true
DEV_TEST_MANAGER_EMAIL=vasil@example.com
```

When enabled, the authenticated user with `DEV_TEST_MANAGER_EMAIL` is evaluated as an Internal Manager for partner approval authorization only. The portal does not update `user_type`, create fake users, create memberships, or modify production data for this override. In production, this override is disabled regardless of environment variables.

### Production 1C OData

Partner approval lookup uses server-only HTTP Basic authentication:

```bash
ONEC_BASE_URL=https://erp-api.nsd.md/novotech/odata/standard.odata
ONEC_AUTH_MODE=basic
ONEC_USERNAME=your-odata-user
ONEC_PASSWORD=your-odata-password
ONEC_TIMEOUT_MS=10000
ONEC_USE_MOCK_PARTNERS=false
```

Never prefix these variables with `NEXT_PUBLIC_`. The browser receives only neutral partner, contract, and price-type DTOs.

### Proposal Email Delivery

Commercial proposals use a server-only SMTP transport. Configure these variables locally and in the production deployment:

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM_EMAIL=proposals@example.com
SMTP_FROM_NAME=Novotech Partner
SMTP_TIMEOUT_MS=10000
PUBLIC_APP_URL=https://www.nsd.md
```

`SMTP_USER`, `SMTP_PASSWORD`, and provider responses remain server-only. Public proposal links contain a one-time generated high-entropy token; the database stores only its SHA-256 hash.

### Development Internal Manager Bootstrap

For product demos that need real authorization records, run:

```bash
npm run bootstrap:dev
```

The command uses `.env.local` Supabase configuration and creates or updates one development internal manager account:

```text
Email: manager@novotech.local
Password: Manager123!
```

The command is idempotent. It ensures the auth user, active internal user profile, `internal_manager` role, `CanApprovePartner` permission, and role-permission assignment exist. It does not create partner accounts; partners must still register through the normal journey.

## Current Scope

The repository currently contains only the initial foundation. Authentication pages, database schema, Supabase keys, 1C integration, and business features are intentionally not implemented yet.

## Security

Do not commit secrets. Supabase keys, 1C credentials, API tokens, service-role keys, and private URLs must be provided through environment variables only.
