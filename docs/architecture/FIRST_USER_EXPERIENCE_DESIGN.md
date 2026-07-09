# First User Experience Design

## Purpose

The first user experience defines the visible journey for a new Novotech Partner Platform user from public entry to Partner Cabinet. It removes mixed internal states from the UI and ensures every screen has one clear next action.

This design is for the Partner Platform only. It must not import Engineering CRM concepts.

## Journey

1. Public user opens the landing page.
2. User chooses either Sign In or Become a Partner.
3. Registered user verifies the account through Supabase auth email flow when enabled.
4. Authenticated user is routed to onboarding if profile or company access is missing.
5. User creates a safe portal profile.
6. User submits a partner company access request.
7. User waits for Novotech review.
8. Approved partner with active membership enters Partner Cabinet.

## Application States

| State | Visible Destination | Primary Action |
| --- | --- | --- |
| Public visitor | `/` | Sign In or Become a Partner |
| Unauthenticated user opening private route | `/auth/sign-in` | Sign in |
| Authenticated user without profile | `/onboarding/profile` | Create profile |
| Authenticated user with profile but no company request | `/onboarding/access-request` | Request company access |
| Authenticated user with pending request | `/onboarding/waiting` | View request status |
| Authenticated user with active company membership | `/cabinet` | Use cabinet |
| Suspended, revoked, or rejected user | Onboarding-safe blocked state | Contact Novotech |

## Routing Rules

Partner Cabinet routes must not render invalid mixed states. The cabinet layout performs state gating before rendering the workspace:

- missing authentication redirects to `/auth/sign-in`
- missing profile redirects to `/onboarding/profile`
- missing active membership with pending request redirects to `/onboarding/waiting`
- missing active membership without pending request redirects to `/onboarding/access-request`
- active membership allows Partner Cabinet rendering

Onboarding pages may call onboarding Server Actions, but they must not query Supabase directly or instantiate repositories.

## Authentication Flow

Authentication is handled through Supabase auth using server actions:

- sign in with email and password
- register with company, country, email, and password
- sign out from private workspace

The UI must not expose auth implementation details, raw Supabase errors, SQL errors, stack traces, or internal state labels such as unknown, profile unavailable, or authenticated user.

## Profile Creation

Profile creation is a controlled onboarding operation:

- the authenticated user may create only their own initial profile
- created profiles start as external registered users
- users may update only safe profile fields such as full name and phone
- users may not self-promote, change status, change user type, or create membership

RLS must enforce self-profile creation. Service Role must not be used.

## Company Access

Company access is requested, not self-approved:

- user submits requested company name
- user submits fiscal code, VAT number, or IDNO when available
- user submits contact phone and optional message
- 1C reference is internal-only and must be assigned later by manager/admin approval workflow
- external 1C reference is never collected from partner-facing onboarding
- no company, membership, approval, catalog, pricing, order, or finance access is created by the request itself

Novotech manager/admin approval remains a separate future workflow.

## Partner Cabinet Header

The Partner Cabinet header displays user-facing identity only:

- full name or email
- company name when active company context exists
- role identifier from validated membership context
- logout action

It must not display internal placeholders such as unknown, profile unavailable, or authenticated user.

## Navigation Rules

Navigation reflects valid current capability:

- users without active company access see only Dashboard, Profile, Company, and Memberships
- Catalog is visible only when active company context exists
- impossible future sections such as Orders, Documents, and Finance are hidden until they are usable

Disabled or hidden navigation must not imply access to unfinished commercial workflows.

## Empty States

Empty states must explain:

- what is happening
- why the user is seeing the state
- the next action

Examples:

- pending approval explains that Novotech is reviewing the request
- no products explains that catalog synchronization may still be running
- missing company access points to the company access request flow

## Security Rules

- No direct Supabase access from UI components.
- No repository imports in UI components.
- No business authorization logic in React.
- No Service Role in onboarding or cabinet UI.
- No 1C calls from UI or Server Actions.
- No commercial data is shown before validated active company access.
- Partners cannot assign their own 1C reference, company role, access profile, or price group.
- Only internal/admin manager workflow may later bind a request or company to a 1C partner reference.

## Testing Expectations

FUX tests should cover:

- landing routing affordances
- unauthenticated action results
- profile creation and update forms
- onboarding state transitions
- pending access request display
- Partner Cabinet header identity rendering
- navigation visibility with and without active company access

## Cross References

- `docs/architecture/ONBOARDING_SERVER_ACTIONS_DESIGN.md`
- `docs/architecture/ACCESS_CONTROL_SERVICE_DESIGN.md`
- `docs/architecture/FRONTEND_ARCHITECTURE.md`
- `docs/architecture/SECURITY_AND_DATABASE_ARCHITECTURE.md`
- `docs/domain/ACCESS_CONTROL_DOMAIN.md`
- `docs/domain/PARTNER_DOMAIN.md`
