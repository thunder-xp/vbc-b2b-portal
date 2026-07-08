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

## Current Scope

The repository currently contains only the initial foundation. Authentication, database schema, Supabase keys, 1C integration, and business features are intentionally not implemented yet.

## Security

Do not commit secrets. Supabase keys, 1C credentials, API tokens, service-role keys, and private URLs must be provided through environment variables only.
