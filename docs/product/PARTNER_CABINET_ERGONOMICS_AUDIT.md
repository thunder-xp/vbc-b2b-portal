# Partner Cabinet Ergonomics Audit

Audit date: 2026-07-29. Evidence is based on production route implementations
and rendered component contracts. Authenticated production interaction remains
a release-acceptance item because no partner session is available locally.

| Route | Current behavior | Persona | Business impact | Correction | Risk |
| --- | --- | --- | --- | --- | --- |
| `/cabinet` | Static placeholders for projects, service, attention, and activity; no operational links. | All partner roles | The first screen does not answer what to do next. | Show only permitted orders, shipment, finance, and company-access blocks with freshness warnings. | Do not invent counts absent from bounded read models. |
| `/cabinet/orders` | Technical 1C state labels and dense desktop row. | Buyer, manager | Partners must interpret integration state. | Business labels, clearer warnings, mobile cards, preserved server pagination. | Historical state mapping must stay lossless. |
| `/cabinet/orders/[id]` | Strong data coverage but weak next-step hierarchy. | Buyer | Current action and expected next step are easy to miss. | Put status, dates, company, total, next step, and warnings first. | Preserve price redaction. |
| `/cabinet/reservation-requests` | One chronological list; no visual due-date groups. | Operations | Overdue and imminent shipments are hard to scan. | Group the bounded page by overdue, today, next three days, and later. | Groups apply to the current server page only. |
| `/cabinet/finance` | Currency separation exists; labels use accounting terminology. | Owner, accounting | Correct data is less approachable than necessary. | Use `К оплате`, `Аванс`, contract count, and explicit freshness. | Never aggregate unlike currencies. |
| `/cabinet/company` | Only role, 1C code, and partner status are shown. | Owner, manager | Readiness and access risks are unclear. | Add explicit portal/commercial/integration readiness and management path. | Do not expose UUIDs. |
| `/cabinet/company/users` | Raw role names and compact inline mutation forms. | Owner, manager | Role consequences and price visibility are unclear. | Canonical role/price labels, explanations, invitation status details, impact copy. | Preserve mandatory reason and owner protection. |

## Boundaries

- No live 1C calls are introduced.
- Existing bounded, company-scoped read models remain authoritative.
- No per-row Auth Admin, price, finance, or order lookup is added.
- Sensitive actions continue through existing server actions and atomic database rules.
