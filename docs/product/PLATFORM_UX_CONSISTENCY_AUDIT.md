# Platform UX Consistency Audit

Audit date: 2026-07-29. Evidence comes from active route implementations,
shared component inventory, component tests, and production unauthenticated
smoke checks. Authenticated partner/admin traversal remains release acceptance.

| Route / surface | Component | Current behavior | Canonical behavior | Severity | Persona | Regression risk |
| --- | --- | --- | --- | --- | --- | --- |
| Partner operational routes | Domain status badges | Estimates, reservations, specifications, and workspace cards use independent colors and wording. | Domain adapters consume one semantic status model and shared badge. | High | Partner, manager | Preserve domain enums and labels. |
| Partner list routes | Route-local headers | Titles, subtitles, actions, and spacing are recreated per page. | One server-safe page header with optional back link, status, and actions. | Medium | Partner | Avoid turning read-only headers into client components. |
| Admin routes | `AdminPageHeader` and route-local headers | Existing admin header cannot carry actions or status; some pages bypass it. | Shared page structure with admin styling retained through props. | Medium | Internal staff | Preserve admin authorization and shell ownership. |
| Empty lists | Route-local paragraphs/cards | Empty states vary between a sentence, dashed card, or blank table. | Explain why, active filters, and one useful next action. | High | All | Never imply data absence after a failed query. |
| Errors | Catalog/orders route boundaries | Catalog exposes a correlation digest; orders does not. Touch targets and escape navigation differ. | Domain-specific recovery, safe digest, retry, and route escape. | High | Partner | Never expose stack or integration payload. |
| Loading routes | Route-local skeletons | Skeleton shape and reduced-motion behavior differ. | Context label, stable geometry, surrounding navigation, reduced-motion-safe animation. | Medium | All | No hidden-tab loading or new data calls. |
| Date/money output | Route-local `Intl` calls | Date styles, timezone handling, currency precision, and separators differ. | Central Russian business formatters with explicit UTC date-only handling. | Medium | All | Do not combine currencies or reinterpret timestamps. |
| Company users/access | Role and permission copy | Technical membership language remains in a few partner components. | Explain company capability and business role; codes remain admin-diagnostic only. | High | Company owner | Do not weaken authorization checks. |
| Dialogs | Estimate, proposal, invitations, dates | Most have titles and pending state; focus restoration and backdrop behavior are inconsistent. | Escape, focus entry/restoration, explicit consequence, cancel/primary hierarchy. | High | All | Preserve idempotency and entered values. |
| Mobile tables | Specifications/admin lists | Several desktop tables default to horizontal scrolling. | Existing desktop table plus structured mobile cards on high-use routes. | Medium | Mobile users | Avoid duplicate hidden interactive controls. |

## Proven Constraints

- No shared primitive may own domain authorization, pricing, status transitions,
  synchronization, or persistence.
- Shared components remain server-compatible unless interaction requires a
  focused client island.
- Existing domain DTOs and enums remain canonical technical contracts.
- Normal page rendering must not add live 1C, SMTP, or per-row data requests.
- Analytics failures remain invisible to core workflows.
