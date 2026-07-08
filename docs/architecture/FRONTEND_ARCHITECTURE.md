# Frontend Architecture

## Purpose

The frontend architecture defines how the Novotech Partner Platform should present partner and internal workflows while preserving domain boundaries, access control, and implementation clarity.

The frontend is a work-focused B2B interface. It should prioritize speed, clarity, dense information, predictable navigation, and safe handling of restricted commercial data.

## Pages

Pages are route-level screens in the Next.js App Router.

Pages should:

- Compose layouts and domain components.
- Load server-side data through services.
- Keep business decisions out of page markup.
- Respect access-controlled data returned by backend services.
- Provide clear loading and error boundaries.

Future page groups may include:

- Partner dashboard.
- Catalog.
- Product detail.
- Cart.
- Order requests.
- Orders.
- Documents.
- Finance.
- Notifications.
- Admin.

## Layouts

Layouts provide shared structure for related route areas.

Expected layouts:

- Public or unauthenticated shell in future auth work.
- Partner portal shell.
- Manager/admin shell.
- Domain-specific sub-layouts where needed.

Layouts should handle navigation structure and page framing, but should not own domain workflows.

## Navigation

Navigation should reflect user role, partner status, and permissions.

Rules:

- Hide navigation items the user cannot access.
- Do not rely on hidden navigation as the only security control.
- Recheck permissions in backend services.
- Keep partner navigation focused on daily tasks.
- Keep admin navigation clearly separated from partner workflows.

## Dashboards

Dashboards should summarize actionable information.

Partner dashboard may include:

- Recent orders.
- Order requests needing attention.
- Relevant documents.
- Notifications.
- Catalog shortcuts.
- Finance summary only if permitted.

Manager dashboard may include:

- Partner approvals.
- Order requests.
- Integration failures.
- Access changes needing review.
- Suspended partner issues.

Dashboards should not bypass domain services or access checks.

## Module Isolation

Frontend modules should align with backend domains.

Rules:

- Catalog UI should not implement pricing logic.
- Pricing display components should receive already-authorized values.
- Inventory display should receive already-authorized availability views.
- Order UI should call order actions/services rather than mutating unrelated state.
- Admin UI may coordinate domains but should use domain services.

Shared components should be generic and not encode partner-specific business rules.

## Component Hierarchy

Recommended hierarchy:

```text
Page
  Layout / Shell
    Domain Feature Component
      Domain UI Components
        Shared UI Primitives
```

Responsibilities:

- Pages compose route-level experience.
- Feature components handle domain screen composition.
- Domain UI components display domain-specific data.
- Shared UI primitives provide buttons, inputs, tables, dialogs, badges, and feedback states.

Business rules belong outside UI components.

## State Management Philosophy

Prefer server state and URL state over broad client state.

Use:

- Server-rendered data for initial views.
- Server Actions for mutations.
- URL search params for filters, sorting, pagination, and search where practical.
- Local component state for temporary UI state only.
- Future client caches only when they improve repeated interaction without weakening data freshness.

Avoid:

- Global client stores for business truth.
- Storing hidden prices or stock in browser state.
- Trusting client state during checkout.
- Duplicating backend validation in the UI as the only source of truth.

## Loading Strategy

Loading states should be specific and useful.

Patterns:

- Route loading for whole-page transitions.
- Section loading for dashboard panels.
- Table skeletons for dense catalog/order views.
- Button pending states for mutations.
- Clear disabled states while validation is running.

For checkout, loading must not imply confirmation. Confirmation exists only after required backend and 1C steps succeed.

## Error UI

Error UI should be safe and actionable.

Error categories:

- Permission denied.
- Not found or hidden by access profile.
- Validation failed.
- 1C unavailable.
- Price changed.
- Stock changed.
- Order submission failed.
- Reservation failed.
- System error.

Rules:

- Do not expose raw stack traces or raw 1C errors.
- Do not reveal restricted data in error text.
- Give partners a clear next step.
- Give managers enough context to resolve operational issues.

## Permissions

Frontend permission behavior must mirror backend access control but not replace it.

The frontend may:

- Hide unavailable actions.
- Disable blocked buttons.
- Show restricted states.
- Explain when manager approval is required.

The frontend must not:

- Treat hidden UI as security.
- Decide final permission without backend validation.
- Show hidden prices, stock, documents, finance data, or product records from stale client state.

## Future Mobile Compatibility

The portal should support mobile and tablet use where practical, especially for managers and partners checking orders or documents.

Design principles:

- Dense desktop tables may need mobile alternatives.
- Fast order may remain desktop-first.
- Critical actions should be usable on tablet.
- Text should not overflow controls.
- Navigation should remain predictable on smaller screens.
- Download and document workflows should account for mobile limitations.

Mobile compatibility should not turn the B2B portal into a retail-style app.

## Frontend Non-Goals

The frontend should not:

- Implement accounting logic.
- Implement 1C communication directly.
- Store official commercial truth.
- Bypass backend access checks.
- Copy Engineering CRM screens without redesign.
- Use marketing landing-page patterns for operational workflows.
