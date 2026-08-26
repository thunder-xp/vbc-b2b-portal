# Development Rules

## Commit Discipline

- Prefer small commits with a clear purpose.
- Keep each step reviewable and easy to revert.
- Do not bundle unrelated domains into one change.

## Domain Boundaries

- Work on one domain per step.
- Keep domain logic inside the relevant module under `src/modules`.
- Keep shared infrastructure in `src/lib` only when it is genuinely cross-domain.

## Legacy Code

- Do not directly duplicate legacy NSD code.
- Do not copy Engineering CRM logic, database assumptions, or UI flows into this project.
- Re-design behavior for the B2B Partner Platform context before implementation.

## Secrets

- Store all secrets only in environment variables.
- Never commit Supabase keys, 1C credentials, API tokens, service-role keys, or private URLs.
- Document required environment variable names without including secret values.

## Project Separation

- Do not mix Engineering CRM logic into this project.
- Treat the B2B Partner Platform as a separate application with separate product goals.
- 1C remains the source of truth for products, prices, stock, partners, documents, orders, invoices, debts, and credit limits.

## Commercial Currency Checklist

For contract mapping, commercial-profile sync, checkout, pricing, and order export:

- Name settlement, authoritative price, and published price currencies explicitly.
- Require a valid settlement currency, but never compare it with a price currency.
- Compare the authoritative 1C price-type currency only with the published local price currency.
- Fail closed on missing or mismatched price currency; never guess, convert, or fall back.
- Keep the exact governed contract and price type server-derived.
- Preserve compatibility aliases only at rolling-deployment boundaries, not in domain logic.
- Add the commercial-currency matrix and architecture-guard tests for material changes.
- Verify representative MDL-settlement/USD-price and same-currency contracts before release.
