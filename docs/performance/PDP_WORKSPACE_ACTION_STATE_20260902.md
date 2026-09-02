# Product Detail workspace/action-state boundary — 2026-09-02

Task: `PERF-PDP-WORKSPACE-ACTION-STATE-20260902`

Status: `NOT_COMPLETED`. The mandatory 50 ms p50 removable-latency precondition is not met, so no candidate was implemented or deployed.

## Workspace physical execution count

The cabinet shell and Product Detail page each call `getPartnerWorkspaceContextAction()`, but they do not cause two physical workspace resolutions.

The action obtains the same request-cached authenticated user ID and calls `createPartnerWorkspaceContextService()`. The factory returns one module-level `workspaceContextService`. That singleton owns:

```ts
private readonly resolveWorkspaceContext = cache((userId: string) =>
  this.loadWorkspaceContext(userId),
);
```

Both consumers therefore invoke the same React `cache()` function identity with the same authenticated user ID. The result is **two action consumers, one physical `loadWorkspaceContext` execution per RSC request**.

The previously captured preview traces corroborate this source proof. Each Product Detail GET produced one workspace execution and one deferred `partner_order_history_bootstrap_first_access_checked` event from inside that physical load. Starting the page consumer earlier changed its observed wait from the remaining 84–105 ms to the full shared 140–166 ms promise; it did not create or remove an execution.

## Cache identity

| Boundary | Cache identity/result |
|---|---|
| Supabase server client | One request-scoped `createClient()` |
| Authenticated user | One request-scoped `getAuthenticatedUser()` |
| Profile | Shared singleton `DefaultUserProfileService` cache keyed by user ID |
| Membership/company | Shared singleton `DefaultCompanyAccessService` caches keyed by user/company IDs |
| Permissions | Shared singleton `DefaultPermissionService` effective-context cache keyed by user/company IDs |
| Workspace | Shared singleton `DefaultPartnerWorkspaceContextService` cache keyed by user ID |
| Shell and PDP consumers | Same function identity and arguments; one physical workspace load |

Favorites constructs a new `PurchasingListService`, but that service receives the same singleton company-access and permission services. Its auth, membership, company, and effective-permission reads therefore reuse the request caches. It adds one physical bounded `list_system_favorite_product_ids` RPC.

## Critical path and action-state dependencies

Original Product Detail path:

```text
identity
  └─ primary product/tab reads + shared workspace
       └─ favorite RPC
            └─ Analytics read, only when Analytics is active
                 └─ final Flight chunk
```

Favorite state requires authenticated user → active membership/company → `purchasing_lists.view` permission → product ID. The workspace presentation DTO is not itself required, but the same governed company/permission resolution is required. Existing request caches prevent those prerequisite reads from executing twice.

Other Product Detail actions do not add initial server reads:

- Compare state is read from company/user-scoped browser storage after mount; no server request blocks Flight.
- Cart has no initial product action-state read. `addToCartAction` runs only after the user submits.
- Estimate drafts load only when the user opens the estimate chooser.
- Estimate capability is already part of the shared workspace capability model.
- Commercial price/stock reads are active-tab data, not action state, and are correctly limited to Overview/relations.
- Favorite mutation remains a server action with server-side company/permission enforcement and RLS.

## Timing and maximum removable latency

Measured serial components from the matched preview trace:

| Component | Observed duration | Frequency in representative sequence | Earliest-safe constraint |
|---|---:|---:|---|
| Shared workspace | roughly 140–166 ms full promise; 166–202 ms completion in original page trace | 5/5 | Already one execution and already shared with shell; not removable by another abstraction |
| Favorite RPC tail | roughly 23–29 ms typical, 23–47 ms observed range | 5/5 | Could start after trusted company/permission identity, but maximum typical saving is about 26 ms |
| Analytics intelligence | roughly 24–27 ms | 1/5 | Requires server-derived company and permission; can overlap favorites only on Analytics |
| Compare/cart/estimate initial reads | 0 ms | 5/5 | No initial network boundary exists |

For the five-transition sequence, the removable tail is approximately `[26, 26, 26, 26, 51]` ms. Its representative p50 is therefore **about 26 ms**. Even complete removal of the universal favorite boundary is below the required 50 ms p50 precondition.

The prior concurrency experiment is the empirical upper bound: overlapping workspace/favorites/Analytics changed matched stream p50 from 225.0 to 187.5 ms (16.7%) and click-to-visible from 401.6 to 355.7 ms (11.4%). It failed the retained-change target and was removed. Repeating the same scheduling under a different name cannot meet this task's gate.

## Decision

The task's kill switch applies because:

1. Workspace already executes once.
2. Universal remaining serial action-state cost is below 50 ms p50.
3. The measured prior implementation improved real navigation by only 11.4%, below 15%.
4. A combined workspace/action-state RPC would duplicate the rejected workspace architecture and couple product-specific state to a broad context boundary.

No implementation, benchmark candidate, migration, RPC, test change, preview deployment, or production deployment was created. Network/DB calls remain unchanged: one physical workspace chain and one bounded favorite RPC on eligible Product Detail tabs.

## Security and correctness

The retained architecture continues to derive auth UID, active company, membership, and permissions on the server; RLS remains active; Competitive Intelligence remains company/permission gated; partner pricing and stock remain private. There is no Service Role or global user cache. Favorite, compare, cart, estimate, RU/RO, direct URLs, history, `returnTo`, and Back/Forward behavior are untouched.

## Final Product Detail verdict

The final bounded Product Detail action-state opportunity is exhausted. The remaining latency cannot be reduced materially without violating the explicit complexity threshold or reopening rejected architecture.

Next step: **Catalog Payload Optimization**.
