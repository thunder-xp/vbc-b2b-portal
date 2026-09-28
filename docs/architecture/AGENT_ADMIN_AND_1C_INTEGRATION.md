# Agent Admin and 1C integration

## Ownership

The Portal owns the Commercial Agent identity, access, lifecycle, compliance, canonical NSD Agent Code, Admin workflow, audit, referrals and local economic projections. 1C owns Counterparties, Contracts, Projects and accounting documents. The Portal stores verified references and snapshots; those records do not become a second ERP.

`commercial_agents.agent_code` is the canonical NSD Agent Code. The existing database trigger makes it immutable. A healthy chain requires an exact match with the 1C Counterparty and Contract custom property. A Project is accepted only when its exact Counterparty and Contract relations match and its code is proven by the same custom property or by an exact structured name token. Fuzzy and name-only binding are forbidden.

## Local rendering and explicit verification

`/admin/agents` and `/admin/agents/[agentId]` render from bounded Portal read models and one bounded Supabase Auth directory read. They do not call 1C during page render. The Admin must explicitly run a read-only verification or candidate discovery action.

The verified 1C metadata contract is:

- Counterparty: `Catalog_Контрагенты`, stable `Ref_Key`, custom property collection `ДополнительныеРеквизиты`.
- Contract: `Catalog_ДоговорыКонтрагентов`, stable `Ref_Key`, exact `Owner`/`Owner_Type` Counterparty relation, number, dates, type, signed and inactive fields, and the same custom property collection.
- Project: `Catalog_Проекты`, stable `Ref_Key`, direct `Контрагент_Key` and `Договор_Key`, dates and custom property collection.
- Agent Code property definition: `ChartOfCharacteristicTypes_ДополнительныеРеквизитыИСведения`; rows use exact `Свойство_Key` and `ТекстоваяСтрока`/scalar `Значение`.

The integration resolves the property by an exact governed label and exact property `Ref_Key`. It returns only `MATCH`, `MISSING`, `MISMATCH` or `NOT_VERIFIED`.

## Binding and history

`agent_1c_bindings` remains the single Counterparty binding. Verification fields record the observed Agent Code, state and timestamp. A correction requires a reason and optimistic expected old Ref_Key, and is blocked when a sale, Contract or Project is already linked.

`agent_1c_contract_bindings` and `agent_1c_project_bindings` hold history-preserving references. Each Agent has at most one current Contract and one current Project. Replacing a Contract supersedes its current Project because that Project's relation points to the old Contract. Binding requires exact relationship evidence and `MATCH`; it never changes Agent lifecycle.

All mapping tables use RLS and FORCE RLS. Browser roles have no table mutation access. Service-role RPCs use `security definer` with an empty fixed `search_path`, advisory locks and append-only domain events. Service role does not receive delete permission.

Existing `contract_ready` values remain classified as legacy evidence. The feature does not downgrade an active Agent and does not make the new binding a lifecycle gate. A future cutover to verified 1C Contract as an activation requirement needs a separate architecture decision.

## Auth and Quick Auth

Auth identity is linked only through `commercial_agents.user_id`. Email confirmation and Auth phone confirmation come from Supabase Auth. A profile contact phone is not a verified login phone. Quick Auth is ready only for an active Agent whose confirmed Auth phone exactly matches the normalized Agent profile phone.

Admin password help uses `resetPasswordForEmail` and the normal signed Supabase recovery session. The Agent chooses the new password. The Portal never reads, stores, generates or displays a permanent password, recovery token or link. Session revocation is absent because the current platform has no governed per-user session-revocation primitive; no parallel session registry is introduced.

## Economic evidence

Existing sale and reward projections remain unchanged. UI states distinguish a projection, Finance-approved amount and paid evidence. Contract or Project presence cannot make money payable. Missing reward projection remains missing rather than being rendered as zero.

## Reconciliation and writes

Counterparty correction is allowed only before downstream Portal evidence exists. Once sales, Contract or Project bindings exist, Admin receives a reconciliation-required failure and historical ownership remains untouched.

This implementation makes no 1C writes. The custom Agent Code OData write contract has not been proven, so `ONE_C_AGENT_CODE_WRITE_READY = NO`. Contract and Project creation remain 1C-owned and require a separate explicit task and approval.
