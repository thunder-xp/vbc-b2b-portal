# Catalog Ergonomics And Favorites Consolidation

## Baseline

- Catalog cards use a `1 / 2 / 3` column grid and a 12-product page.
- Routine stock, arrival, and price freshness labels render above every normal catalog result.
- Card images use the shared allowlisted `ProductThumbnail`; eight production-shaped 384 px derivatives total 79,894 bytes warm.
- The catalog client module graph is approximately 184 KB across seven unique chunks.
- Legacy bookmarks are stored in `partner_product_favorites` and are writable through a separate catalog service.
- Reusable saved selections are stored in `purchasing_lists` and `purchasing_list_items`.
- Production audit on 2026-07-21: zero legacy favorite rows and zero purchasing lists. The migration remains data-preserving and rerunnable.

## Presentation Decision

The existing catalog result query remains authoritative. One client presentation boundary switches the already-loaded page between cards and a compact list; it does not fetch catalog data. A versioned cookie stores `cards` or `list`, defaults to `cards`, and is read by the server to avoid hydration mismatch.

Cards use responsive `1 / 2 / 3 / 4 / 5` tracks. Both modes retain the optimized thumbnail, identity, partner and retail prices, availability, expected arrival, quantity/cart controls, and saved-product controls. Routine freshness labels disappear; only stale or unknown warnings remain.

## Saved-Product Decision

`purchasing_lists` remains the sole writable aggregate. A boolean system subtype identifies one protected `Избранное` list per company and user:

- private visibility;
- lazy creation on first add;
- unique `(company_id, created_by)` while system-favorites is true;
- fixed name and no archive;
- unique product membership and quantity `1` on bookmark add;
- same control removes the membership without deleting the list.

Other purchasing lists retain their existing behavior and chooser. Navigation becomes `Избранное и списки`; it remains one workspace route.

## Access And Query Budget

All writes go through narrow security-definer RPCs that verify `auth.uid()`, active company access, `purchasing_lists.manage`, and an active/visible catalog product. Anonymous execution is revoked. A bounded bulk RPC returns saved product IDs only for the current user's private system list and the visible page IDs. It adds one query per catalog page, never one query per card.

No 1C calls, public tenant cache, price/stock ownership changes, global revalidation, or full-list reads are introduced.

## Legacy Migration

The migration creates or resolves each user's system list and inserts valid legacy products with `ON CONFLICT` protection. It filters by matching active membership and active/visible catalog product, reports invalid rows through aggregate verification queries, and leaves `partner_product_favorites` intact but read-only for authenticated users. The migration can safely rerun.

Final table removal is deferred until post-release acceptance and rollback expiry.
