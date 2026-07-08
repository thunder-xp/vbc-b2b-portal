# Finance Domain

## Business Goals

The finance domain defines how financial information is displayed in the Novotech Partner Platform.

The portal is not accounting software. It does not calculate official debt, balance, credit limits, payment status, or accounting truth. 1C owns accounting and finance data.

The main business goals are:

- Let authorized partners see relevant financial information without contacting Novotech for every routine question.
- Protect sensitive finance data by default.
- Keep 1C as the source of truth for accounting and commercial finance.
- Support manager-controlled finance visibility by partner company.
- Help partners understand payment status, balance, debt, and credit constraints when permitted.
- Avoid financial, legal, and relationship risk from stale or incorrect finance data.

## Core Entities

### Balance

Balance is the partner company's financial balance as recorded by 1C.

The portal may display balance only when finance permissions allow it. It must not calculate official balance independently.

### Debt

Debt is the amount owed by a partner company according to 1C.

Debt may include overdue amounts, open receivables, or other accounting values depending on Novotech policy and 1C definitions.

### Credit Limit

Credit limit is the maximum allowed credit exposure for a partner company.

Credit limit belongs to 1C and may affect order acceptance. Visibility to partners must be explicitly controlled.

### Credit Days

Credit days define allowed payment delay or payment term duration.

Credit days are commercial/finance terms owned by 1C or approved finance process. The portal may display them only when allowed.

### Invoice

An invoice is an official accounting document issued through 1C.

The portal may display invoice metadata, payment state, and downloads only according to accounting document permissions.

### Payment Status

Payment status describes whether an invoice or balance is unpaid, partially paid, paid, overdue, or otherwise classified.

Payment status belongs to 1C and may be displayed as a snapshot.

### Financial Permission

Financial permission defines which finance data a partner company can see.

It is portal-owned and controlled manually by Novotech managers or admins through access profile rules.

## Data Owned by 1C

1C owns:

- Balance.
- Debt.
- Overdue amount.
- Credit limit.
- Credit days.
- Invoices.
- Fiscal invoices.
- Payment status.
- Payment history.
- Accounting documents.
- Finance constraints that affect order acceptance.
- Official currency and accounting values.

The portal may cache and display this data according to access permissions, but it must not become the official finance record.

## Data Owned by Portal

The portal owns finance visibility and workflow metadata, including:

- Financial permissions.
- Partner-facing finance visibility settings.
- Finance data cache timestamps.
- Finance notification preferences.
- Audit history for sensitive finance access.
- Manager notes about finance visibility.
- Display labels and grouping for finance screens.

Portal-owned finance data controls presentation and access. It does not redefine accounting truth.

## Visibility Permissions

Finance data should be hidden by default.

Possible permissions include:

- View balance.
- View debt.
- View overdue amount.
- View credit limit.
- View credit days.
- View invoice list.
- View invoice details.
- Download invoices or fiscal invoices.
- View payment status.
- View accounting documents.

Rules:

- Partner status must be checked before finance visibility.
- Suspended partners should not receive normal finance visibility unless explicitly allowed.
- Finance permissions apply at the partner company level.
- A partner user must never see finance data for another partner company.
- Invoice visibility does not automatically imply debt or credit-limit visibility.
- Credit-limit visibility does not automatically allow order creation.
- Finance data must not appear in notifications, exports, search, or logs unless permission allows it.
- If permissions are missing or inconsistent, use the safer hidden behavior.

## Refresh Strategy

Finance data should be refreshed conservatively because stale values can create business risk.

Refresh triggers may include:

- Scheduled synchronization from 1C.
- Partner opening finance-related views.
- Partner starting checkout where credit terms may matter.
- Manager opening partner finance context.
- Invoice or payment status sync.
- 1C event in future asynchronous integration.

Rules:

- Cached finance data must include freshness metadata.
- Stale debt, balance, or credit-limit data should not be presented as guaranteed.
- Order acceptance should rely on 1C or approved current validation when finance constraints matter.
- If 1C is unavailable, the portal should not invent or recalculate finance values.

## Security

Finance data is sensitive and requires extra care.

Security requirements:

- Finance data is hidden unless explicitly enabled.
- Service-role and integration credentials must remain server-only.
- Sensitive finance reads should be auditable.
- Finance exports and downloads should be permission-checked.
- Finance notifications must not leak sensitive values to unauthorized users.
- Logs should avoid unnecessary sensitive amounts or document contents.
- Access changes for finance permissions should be audited.
- Future admin override should be logged and reviewed.

## Future Extensions

Possible future extensions include:

- Partner finance dashboard.
- Invoice payment reminders.
- Overdue balance notifications.
- Credit-limit usage visualization.
- Finance approval workflow for risky orders.
- Manager review tasks for credit exceptions.
- Partner-visible payment history.
- Downloadable account statements.
- Scheduled statement emails.
- Finance data access audit reports.
- Integration events for invoice and payment status changes.

Future finance features must preserve the rule that 1C owns accounting truth and the portal controls only visibility and partner experience.
