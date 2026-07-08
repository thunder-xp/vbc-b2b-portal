# Partner Domain

## Business Goals

The partner domain defines how Novotech Systems manages partner companies and their users inside the B2B Partner Platform.

The main business goals are:

- Give approved partner companies controlled access to Novotech distribution workflows.
- Let Novotech managers decide how much information each partner company can see.
- Keep partner-facing work simple, predictable, and separated from internal Engineering CRM processes.
- Protect commercial data such as prices, stock depth, invoices, debts, and credit limits.
- Keep 1C as the source of truth for official commercial and accounting data.
- Let the portal manage partner access, daily interaction, and operational convenience without becoming a replacement for 1C.

## Core Entities

### Partner Company

A partner company is an external business organization that works with Novotech Systems through the portal.

It represents the commercial partner, not an individual person. A partner company may have multiple partner users. The company is the main unit for access depth, commercial visibility, status, and loyalty classification.

### Partner User

A partner user is an individual person who works for one partner company and uses the portal on behalf of that company.

A partner user belongs to exactly one partner company. The user's available information and actions are limited by the partner company's status, access profile, and business relationship with Novotech.

### Novotech Manager

A Novotech manager is an internal Novotech employee responsible for partner oversight.

Managers approve partners, assign access depth, review partner activity, handle exceptional cases, and coordinate business communication. Managers do not replace 1C as the official source of commercial records.

### Access Profile

An access profile describes what a partner company can see and do in the portal.

It is assigned manually by Novotech. It may control visibility of catalog details, prices, stock depth, order capabilities, documents, invoices, debts, credit limits, and other partner-facing information.

Access profile is a portal control concept. It does not change the underlying commercial records in 1C.

### Partner Status

Partner status describes the current operational state of a partner company in the portal.

Typical statuses may include pending review, approved, active, suspended, and archived. Status controls whether the company and its users can use the portal, but it does not by itself define commercial terms.

### Loyalty Level

Loyalty level describes the business relationship category of a partner company.

It may represent commercial importance, relationship maturity, or a partner program tier. Loyalty level can influence future portal behavior, reporting, communication priority, or suggested access settings, but access must still be controlled explicitly through an access profile.

## Relationships Between Entities

- One partner company may have many partner users.
- One partner user belongs to one partner company.
- One partner company has one current partner status.
- One partner company has one current access profile.
- One partner company may have one current loyalty level.
- One Novotech manager may oversee many partner companies.
- One partner company may be overseen by one or more Novotech managers, depending on business process.
- Access profile applies at the partner company level and affects all users of that company.
- Partner status applies at the partner company level and affects all users of that company.
- Loyalty level describes the business relationship with the partner company, not an individual user.

## Lifecycle of a Partner

### Registration

A partner relationship begins when a company is identified as a potential portal user. Registration may be initiated by Novotech or through a controlled request process.

At this stage, the partner company is not yet trusted for full portal access. Basic company and contact information may be collected for review, but access to commercial data should remain limited or unavailable.

### Approval

Novotech reviews the partner company and decides whether it should receive portal access.

Approval confirms that the company is allowed to participate in the B2B Partner Platform. It does not automatically grant deep visibility into prices, stock, documents, debts, or credit limits.

### Access Assignment

After approval, a Novotech manager assigns an access profile to the partner company.

This step defines what the company and its users can see and do. Access assignment is manual and deliberate because different partners may need different levels of visibility.

### Daily Work

During daily work, partner users use the portal to view allowed information, prepare orders, submit orders, review available documents, and interact with Novotech distribution workflows.

The portal should apply the partner company's access profile and status before showing any sensitive data or enabling any action.

### Suspension

A partner company may be suspended when portal access should be temporarily blocked or restricted.

Suspension may happen because of commercial, operational, compliance, debt, security, or relationship reasons. Suspension affects portal access but does not delete the partner company or erase historical activity.

### Archive

A partner company may be archived when the relationship is no longer active or when portal access is no longer needed.

Archive is a long-term inactive state. Historical records should remain understandable for audit and operational review, while normal portal access should remain unavailable.

## Entity Responsibilities

### Partner Company Responsibilities

- Represents the external business partner.
- Groups all partner users from the same company.
- Carries partner-level status, access profile, and loyalty level.
- Defines the business context for portal visibility.
- Provides the company boundary for partner-facing data access.

### Partner User Responsibilities

- Represents a real person acting for a partner company.
- Uses the portal within the limits of the assigned company access.
- Performs partner-facing actions such as viewing allowed catalog data and preparing orders.
- Must not receive access outside the user's own partner company.

### Novotech Manager Responsibilities

- Reviews and approves partner companies.
- Assigns and changes access profiles.
- Suspends or archives partner access when needed.
- Oversees partner activity and supports business operations.
- Keeps portal access decisions aligned with Novotech policy.

### Access Profile Responsibilities

- Defines visibility depth and allowed actions for a partner company.
- Protects sensitive commercial and operational information.
- Provides a clear manual control point for Novotech managers.
- Keeps access decisions separate from authentication and from 1C master data.

### Partner Status Responsibilities

- Describes whether the partner company can currently use the portal.
- Supports review, activation, suspension, and archive workflows.
- Provides a simple operational state for partner access decisions.
- Prevents inactive or blocked companies from continuing normal portal work.

### Loyalty Level Responsibilities

- Classifies the business relationship or partner tier.
- Supports future segmentation, reporting, and partner program workflows.
- May guide manager decisions, but should not silently replace explicit access assignment.
- Remains separate from partner status and access profile.

## Data That Belongs to 1C

1C owns official business and accounting data, including:

- Official partner company records.
- Official product catalog data.
- Prices and price rules.
- Stock and availability.
- Orders after creation in 1C.
- Invoices.
- Documents.
- Debts.
- Credit limits.
- Official commercial terms.
- Accounting and fulfillment records.

The portal may display or cache this information when appropriate, but it must treat it as 1C-owned data.

## Data That Belongs Only to the Portal

The portal owns partner-facing access and experience data, including:

- Portal user accounts and their connection to a partner company.
- Portal access profiles.
- Portal partner status.
- Manager-assigned visibility settings.
- Portal-specific audit notes and operational access history.
- Portal UI preferences and notification preferences.
- Draft carts before order submission to 1C.
- Portal workflow state before a record becomes official in 1C.

Portal-owned data should support access control and partner experience. It should not redefine official commercial records owned by 1C.

## Future Extensions

Possible future extensions include:

- Multiple contacts and departments inside one partner company.
- Partner invitation and approval workflows.
- Configurable access-profile templates.
- Partner-specific document visibility rules.
- Partner program tiers connected to loyalty level.
- Manager assignment history.
- Partner activity scoring and reporting.
- Controlled self-service profile updates.
- Approval workflows for access-profile changes.
- Partner notifications for orders, documents, stock changes, and account status.
- More detailed audit trails for sensitive data access.
- Integration events between the portal and 1C.

These extensions should preserve the same boundary: 1C remains the source of truth for official commercial data, while the portal controls partner access, presentation, and workflow convenience.
