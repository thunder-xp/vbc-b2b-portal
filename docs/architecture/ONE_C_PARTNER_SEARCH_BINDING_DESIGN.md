# 1C Partner Search And Binding Design

## Purpose

Internal/admin managers approve partner access requests by selecting an existing partner record from 1C instead of manually typing ERP references.

The goal is to reduce approval time and prevent incorrect manual binding of partner, contract, or price type identifiers.

## Flow

1. Internal/admin user opens a pending partner request.
2. Admin page calls a Server Action to search 1C.
3. Server Action authenticates the user and verifies internal/admin profile.
4. Server Action calls the Integration Service.
5. Integration Service calls the neutral Partner Provider contract.
6. 1C Provider maps 1C payloads to neutral DTOs.
7. Admin selects a partner result.
8. UI auto-populates partner reference, contract reference, and price type reference from the selected DTO.
9. Approval action sends those references to Access Approval Service.
10. Approval Service binds the request and activates access using the approved ordering rules.

## Boundaries

- UI must not call 1C directly.
- UI must not import provider code.
- Access Control services must not parse 1C payloads.
- 1C payload types stay inside `src/modules/integration/providers/one-c/`.
- The portal stores only selected references.
- 1C remains the source of truth for partner, contract, and price type.

## Search Inputs

Search supports:

- Company name.
- Fiscal code / VAT / IDNO.
- 1C reference.

The provider receives one normalized search query. Provider-specific request shaping belongs inside the 1C provider.

## Search Result

The neutral result contains:

- partner display name
- legal name
- fiscal code
- external partner reference
- available contracts
- available price types

The admin UI selects an active default contract and active default price type when available. If no active contract or price type exists, the result cannot be used for approval.

## Security

- Partner users cannot access partner search.
- Unauthenticated users cannot access partner search.
- Search action returns safe errors only.
- Partner users never see or edit 1C references.
- Partner users cannot assign contracts, price types, roles, or approval state.

## Current Implementation

- `PartnerProvider.searchPartners(input)` defines the neutral provider contract.
- `DefaultPartnerLookupService` validates and delegates search to the provider.
- `searchOneCPartnersAction` enforces internal/admin access before calling integration.
- `OneCProvider` supports real endpoint calls when configured and mock partner search when no endpoint is configured.
- `AccessRequestDecisionForms` uses the search action and sends selected references into the existing approval action.

## Future Extensions

- Dedicated contract picker when a partner has multiple active contracts.
- Dedicated price type picker when a partner has multiple active price types.
- 1C endpoint-specific filtering by separate name, fiscal code, and reference fields if provided by 1C.
- Integration logging for search attempts.
- Audit log entry storing which internal/admin user selected each binding.
