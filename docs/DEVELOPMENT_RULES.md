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
