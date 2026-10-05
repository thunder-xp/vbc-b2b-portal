# Production lineage repair ? Campaign Intent release

TASK_ID: VBC-SPECIAL-OFFERS-CAMPAIGN-INTENT-CART-20261004

Owner approval: attachment 58101147-9743-425e-9191-684ac929455d, 2026-10-05.

Previous main: `eecfa4d5113bdaf4c66fc51a6da5b5d2d6abe205`. Previous production: `a4ac5ca027082c279c01054b28d8a7da203363a1`, READY deployment `dpl_3dfGydEGNaFzHpvTko7ZJKJWuYbU`. Vercel API independently verified exact canonical project, repository and SHA before promotion.

## style: refine partner sidebar typography

SHA: `c821ee131743790df483655dffe402a210053ea2`

Parent: `eecfa4d5113bdaf4c66fc51a6da5b5d2d6abe205`

Changed files:

- `src/modules/partner-cabinet/components/PartnerSidebar.tsx`
- `src/modules/partner-cabinet/components/__tests__/partner-cabinet-shell.test.tsx`

## style: standardize B2B catalog filter typography

SHA: `93b0ffb897e4532433777b3bec0efe243f08ce17`

Parent: `c821ee131743790df483655dffe402a210053ea2`

Changed files:

- `src/modules/catalog/components/CatalogFilterPanel.tsx`
- `src/modules/catalog/components/CatalogFilters.tsx`
- `src/modules/catalog/components/CatalogTechnicalFacetGroupsClient.tsx`
- `src/modules/catalog/components/__tests__/catalog-filter-typography.test.tsx`

## Refine partner dashboard shell and promotions

SHA: `dd970dfb777a409844c586d41b7eb581cc651ed9`

Parent: `93b0ffb897e4532433777b3bec0efe243f08ce17`

Changed files:

- `app/(partner)/cabinet/__tests__/workspace-home-page.test.tsx`
- `app/(partner)/cabinet/layout.tsx`
- `src/modules/catalog/components/MerchandisingBadges.tsx`
- `src/modules/catalog/components/ProductCard.tsx`
- `src/modules/partner-cabinet/actions/service-factory.ts`
- `src/modules/partner-cabinet/components/FinancePeriodPanel.tsx`
- `src/modules/partner-cabinet/components/OperationalDashboard.tsx`
- `src/modules/partner-cabinet/components/PartnerDesktopSidebar.tsx`
- `src/modules/partner-cabinet/components/PartnerHeader.tsx`
- `src/modules/partner-cabinet/components/PartnerLayout.tsx`
- `src/modules/partner-cabinet/components/PartnerPageBreadcrumbs.tsx`
- `src/modules/partner-cabinet/components/PartnerSidebar.tsx`
- `src/modules/partner-cabinet/components/__tests__/partner-cabinet-shell.test.tsx`
- `src/modules/partner-cabinet/services/__tests__/workspace-home.service.test.ts`
- `src/modules/partner-cabinet/services/index.ts`
- `src/modules/partner-cabinet/services/workspace-home.service.ts`
- `src/modules/partner-locale/copy.ts`

## Fix partner dashboard UI regressions

SHA: `a4ac5ca027082c279c01054b28d8a7da203363a1`

Parent: `dd970dfb777a409844c586d41b7eb581cc651ed9`

Changed files:

- `src/modules/catalog/components/MerchandisingBadges.tsx`
- `src/modules/catalog/components/__tests__/merchandising-badges.test.tsx`
- `src/modules/catalog/components/__tests__/product-actions.test.tsx`
- `src/modules/partner-cabinet/components/PartnerLayout.tsx`
- `src/modules/partner-cabinet/components/PartnerSidebar.tsx`
- `src/modules/partner-cabinet/components/__tests__/partner-cabinet-shell.test.tsx`
- `src/modules/partner-cabinet/components/__tests__/platform-visual-unification.test.ts`
- `src/modules/platform-ui/IconActionTooltip.tsx`
- `src/modules/platform-ui/__tests__/icon-action-tooltip.test.tsx`

## Verification and resolution

All four are existing commits in thunder-xp/vbc-b2b-portal, form an unbroken first-parent chain from previous main to the exact deployed SHA, and were promoted without rewriting, squashing or recreating changes. No migration, generated artifact, or Campaign Intent implementation is present in their changed files. Dashboard projection/service changes in dd970dfb are part of the already-deployed UI lineage, using the existing campaign repository; they are preserved exactly. No Special Offers pricing/action/RPC contract changes were made by promotion.

Main was fast-forwarded to a4ac5ca0. Base verification: TypeScript PASS, eight UI suites / 107 tests PASS, build PASS, diff check PASS, legitimate production Partner dashboard and offers-list smoke PASS.

Preserved task commit `5aa5d09674f8ad776d5d80003c18d3c11e518870` rebased to `18b560fa494ff7d9c2c2c467de94637fd8efe28c`, parent a4ac5ca0; no conflicts. Exact feature migration patch identity remained b104ade0c7b869761d61fef38c1ebadeb0a2e232. No feature implementation rewrite.

## Release-governance finding

Production contained committed code absent from canonical main. Feature/CLI production releases must immediately promote the exact released lineage into canonical Git history; subsequent releases must contain the currently deployed SHA. Record this for follow-up without a CI redesign.

Main promotion triggered an unexpected automatic Git deployment of the already-active SHA: `dpl_GR8nz6w8vN57YAZD7EVZ5BUpDoaZ`. Cancellation was attempted but returned 400 because the build was already READY. It deployed the same UI tree; no older UI was deployed. This incurred one extra build, not a recurring cost increase. For the feature release, cancel the automatic build promptly after canonical push, validate/apply the exact canonical migration, then deploy once after DB acceptance.
