# Access Control Domain

## Business Goals

Access control defines what each partner company can see and do inside the Novotech Systems B2B Partner Platform.

The main business goals are:

- Protect commercial information while still giving partners useful self-service access.
- Let Novotech managers and admins manually control partner access depth.
- Support different visibility levels for different partners based on loyalty, turnover, trust, and strategic importance.
- Keep partner access decisions separate from 1C commercial ownership.
- Make partner-facing behavior predictable for sales, finance, logistics, and support teams.
- Prevent suspended or unapproved partners from using the portal as if they were active.
- Provide a clear foundation for future auditing, approvals, and automation.

1C remains the source of truth for commercial data. The portal controls whether that data is visible or usable by a specific partner company.

## Core Concepts

### Access Profile

An access profile is the main manual control point for partner visibility and actions.

It belongs to a partner company, not to an individual user. All users from the same partner company inherit the company's access profile. The profile defines which commercial data categories and actions are enabled for that partner company.

Access profiles should be explicit and understandable by Novotech managers. They should not silently grant sensitive access based only on assumptions or automatic scoring.

### Partner Status

Partner status describes whether the partner company can currently use the portal.

Examples include pending review, active, suspended, and archived. Status acts as a high-level gate. A suspended partner may still have an access profile assigned, but suspension should prevent normal portal work.

### Loyalty Level

Loyalty level describes the business relationship tier of a partner company.

It may be based on relationship history, turnover, strategic importance, payment discipline, or partner program rules. Loyalty level can guide access decisions, but it should not replace explicit access-profile assignment.

### Visibility Permissions

Visibility permissions control what commercial information a partner company can see.

They may include catalog visibility, price visibility, stock visibility, promotions, documents, order history, finance information, and partner-specific commercial terms.

Visibility should always be evaluated before data is shown, exported, searched, or included in notifications.

### Order Permissions

Order permissions control what order-related actions a partner company can perform.

They may include cart usage, order creation, product reservation, special price requests, and access to order history. Order permissions must respect partner status and any commercial limits from 1C.

### Document Permissions

Document permissions control access to product documents, order documents, invoices, acts, shipment documents, certificates, and other files.

Some documents may be broadly safe for partners, while accounting or contract-related documents require stricter control.

### Finance Permissions

Finance permissions control access to debt, balance, credit limit, payment status, overdue amounts, and accounting documents.

Finance permissions are highly sensitive. They should be enabled only for trusted partners and only when Novotech is comfortable exposing the data through the portal.

### Admin Override

Admin override is a controlled internal capability for Novotech admins or authorized managers to bypass normal partner-facing restrictions for operational reasons.

Admin override must not change the partner company's official access profile unless the manager explicitly updates it. Override actions should be visible in audit history in future implementation.

## Manually Enabled or Disabled Capabilities

Novotech managers or admins should be able to manually enable or disable the following at the partner company level:

- Price visibility: whether the partner can see standard prices.
- Individual price visibility: whether the partner can see partner-specific prices or discounts.
- Exact stock visibility: whether the partner can see exact quantities.
- Stock availability only: whether the partner can see only availability states such as available, limited, or unavailable.
- Order creation: whether the partner can create and submit orders.
- Reservation: whether the partner can reserve products through the portal.
- Product documents: whether the partner can access product files, certificates, manuals, or technical documents.
- Order history: whether the partner can view previous orders.
- Accounting documents: whether the partner can view invoices, acts, payment documents, or similar records.
- Debt and balance: whether the partner can view current debt, balance, overdue amount, or payment state.
- Credit limit: whether the partner can view available credit or credit-limit information.
- Promotions: whether the partner can see promotions, campaigns, or special offers.
- Special price requests: whether the partner can request non-standard pricing from Novotech.

These capabilities should be treated as independent switches where possible. For example, a partner may be allowed to create orders without seeing debt, or see stock availability without seeing exact stock quantities.

## Access Level Examples

The following examples describe practical access bundles. They are not fixed database models and should not replace manual permission review.

### New Partner

A new partner is approved for basic portal access but has limited commercial visibility.

Typical access:

- Can view basic catalog information.
- May see stock availability only, not exact quantities.
- May not see individual prices.
- May have order creation disabled until reviewed.
- May not see accounting documents, debt, balance, or credit limit.
- May request special pricing if enabled by a manager.

### Active Partner

An active partner has a regular business relationship with Novotech.

Typical access:

- Can view catalog information.
- Can see standard prices or assigned visible prices.
- Can see stock availability, and possibly limited exact stock data.
- Can create orders if commercial terms allow it.
- Can view order history.
- May access product documents.
- Finance visibility remains optional and manager-controlled.

### Trusted Partner

A trusted partner has a stable relationship, reliable payment behavior, and meaningful recurring turnover.

Typical access:

- Can see individual prices.
- Can see exact stock visibility if approved.
- Can create orders and possibly reserve products.
- Can access product documents and order history.
- May see selected accounting documents.
- May see debt, balance, or credit limit if Novotech approves.
- May see promotions and request special prices.

### Strategic Partner

A strategic partner has high business importance or a deeper commercial relationship with Novotech.

Typical access:

- Can see broad catalog, price, and stock information.
- Can see individual prices and promotions.
- Can create orders and reserve products.
- Can access order history, product documents, and selected accounting documents.
- May see debt, balance, and credit limit.
- May have faster or broader special price request workflows in the future.

### Suspended Partner

A suspended partner should not perform normal portal work even if it previously had broad access.

Typical behavior:

- Cannot create orders.
- Cannot reserve products.
- May be blocked from price, stock, finance, and document visibility.
- May retain read-only access only if Novotech explicitly allows it.
- Existing historical records should not be deleted because of suspension.

## Rules and Edge Cases

- Partner company access is evaluated at the company level.
- A partner user can belong to only one partner company.
- A partner company may have multiple users, and those users inherit the company's access profile.
- Partner status should be checked before detailed permissions.
- Suspended or archived partners should not be allowed to create orders or reservations.
- Access profile controls visibility, not commercial truth. If 1C says stock, price, debt, or credit limit has changed, the portal must not invent a different value.
- If both exact stock visibility and stock availability only are disabled, stock information should not be shown.
- If exact stock visibility is disabled but stock availability only is enabled, the portal may show a simplified availability state without quantity.
- Individual price visibility is more sensitive than general price visibility and should be controlled separately.
- Order creation should not imply reservation permission.
- Reservation permission should not imply order creation unless explicitly allowed.
- Finance permissions should not be enabled by default for new partners.
- Accounting document visibility should be separate from product document visibility.
- Promotions may be visible to some partners and hidden from others.
- Special price requests can be enabled even when automatic individual price visibility is disabled.
- Admin override should be internal-only and should not change what partner users can see.
- If access data is missing or inconsistent, the portal should use the safer interpretation and avoid exposing sensitive data.
- Access decisions should be explainable to Novotech managers.
- Future implementation should audit sensitive access changes and sensitive data views.

## Data That Belongs to the Portal

The portal owns access-control data and partner-facing visibility decisions, including:

- Access profiles.
- Partner portal status.
- Loyalty level as used for portal segmentation.
- Manual permission switches.
- Manager/admin access assignments.
- Admin override events.
- Access change history.
- Visibility rules for portal screens, exports, notifications, and actions.
- Portal-specific labels or descriptions for access levels.

The portal decides whether a partner can see or act on data. It does not become the owner of the commercial data itself.

## Data That Belongs to 1C

1C owns official commercial data, including:

- Products and product master data.
- Prices and individual prices.
- Stock quantities and availability source data.
- Orders after creation in 1C.
- Product reservations once accepted by 1C.
- Invoices and accounting documents.
- Debt, balance, and overdue amounts.
- Credit limits.
- Promotions if they are maintained in 1C.
- Official partner commercial terms.

The portal may cache or display this data according to access rules, but 1C remains the source of truth.

## Future Extensions

Possible future extensions include:

- Access profile templates for common partner categories.
- Approval workflow for sensitive permission changes.
- Scheduled access reviews for partners with finance visibility.
- Temporary access grants with expiration dates.
- More detailed per-user restrictions inside a partner company.
- Audit reports for access-profile changes and admin override usage.
- Visibility simulation for managers before applying an access profile.
- Automatic recommendations based on turnover, payment behavior, and strategic classification.
- Integration events when 1C partner status or commercial terms change.
- Per-document-category permission rules.
- Per-product-category visibility rules.
- Regional or brand-specific access restrictions.
- Partner-facing explanation messages for hidden information.

Any future automation should recommend or assist access decisions, not silently replace Novotech manager control unless the business explicitly approves that policy.
