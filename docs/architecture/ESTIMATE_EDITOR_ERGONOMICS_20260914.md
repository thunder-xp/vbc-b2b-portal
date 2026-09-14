# Estimate editor ergonomics — pre-implementation audit

Task: ESTIMATE-EDITOR-ERGONOMICS-20260914
Baseline: c50ec691df563fbe59bbd506efeb4227ab6f2dd7, production www.nsd.md.
Legitimate partner browser: Vasili Culacov / NOVOTECH SYSTEMS.
Disposable baseline: KP-2026-000128, ff1bb691-8a72-435b-918d-987a2448a97a.

## A. Existing editor map

The route mounts EstimateCommercialEditor, not the legacy EstimateEditor.
Creation requires FinalCustomerPicker then Create; optional settings are already collapsed.
Structural insertion/deletion persists immediately through revision-checked Server Actions.
Ordinary quantity, description and permitted selling-price edits stay local until Save.
Existing calculation/service code owns totals; PDF and lifecycle use EstimateWorkflowPanel.

| Flow | Existing actions / transitions | Persistence and focus |
| --- | --- | --- |
| Create | Choose customer, optional name, Create | customer search + create action + route load; focus moves to page |
| Choose customer | Type >=2 chars, select option | 250ms debounced Server Action; observed existing ANTIBIR choice |
| Create section | Four system sections initialized at creation; no creation control | fixed system keys, backend rejects rename/order changes |
| Equipment | section Add, search, submit, checkbox, quantity, Add selected | one search + one insertion action; insertion clears selection, focus becomes BODY |
| Materials | section Add then same catalog picker | same requests; picker moves to another section and remounts |
| Works | section Add, local service search, checkbox, quantity/price, Add selected | local search; one batch insertion action |
| External | section Add, External tab, existing search/create flow | existing ExternalNomenclaturePicker; separate inline context |
| Quantity | focus numeric input, type, Save | local draft; Enter blurs, does not return to search |
| Price | direct current supported commercial input, Save | local draft; permission unchanged |
| Description | open Details, type, Save | one disclosure per product row |
| Move | not exposed in current editor; full draft contract contains section/position | no new move semantics will be invented |
| Remove | permanent trash button, immediate action | blocked while dirty; revision checked |
| Preview | currently nested in workflow/overflow | existing preview/version route |
| Save | guided readiness action or toolbar; Ctrl+S within workspace | one commercial-save action; structural actions disabled while dirty |
| Save and exit | Save then Back | two distinct actions; no atomic Save-and-exit button |

No modal is required for catalog insertion. The friction is repeated pointer/context movement,
section-local scrolling, selection and focus loss, not modal count. Actual human timing is not measured.

## B. Top ten evidenced friction points

1. Search only runs on form submit; typing alone does not search (source + browser).
2. No ArrowUp/ArrowDown selection or Enter-add path (source).
3. Search has no / or Ctrl+K shortcut (source).
4. After ten-product batch insertion active element is BODY (production DOM evidence).
5. Picker sits below section rows and scrolls away as the section grows (source + browser).
6. Quantity Enter blurs without returning to search; focus does not select value (NumberInput).
7. Product rows permanently render a >=44px advanced-details row (production + source).
8. Trash occupies a permanent action column; uncommon unit/discount fields occupy grid columns.
9. Search success says "Изменение сохранено" although no edit occurred (production).
10. Existing product search result does not indicate same-section membership; insertion appends rows.

## C–E. Proposed interaction architecture / exact changes / exclusions

Use the existing section model and insertion actions. Add a sticky composition lane with exactly
Equipment / Materials / Works, retaining both installation/commissioning destinations under Works.
Quick Add uses the existing bounded local search and service catalog; arrows choose, Enter selects,
quantity receives focus, Enter commits the explicit insertion and returns to search.
Retain the existing batch picker as secondary disclosure because the observed batch path is already efficient.
Show existing-in-section indication; handle duplicate insertion under the same revision/transaction lock.
Move Details/Delete into one row overflow; place current factual stock beside identity, with no price authority change.
Keep controlled inline Save, explicit saved/dirty state and Ctrl+S; Preview/Save in sticky header.
Collapse lifecycle/output actions during draft composition; keep all existing actions available.
Preserve collapsed settings and summary; add counts and Preview to compact summary.
Owner explicitly approved section renaming on 2026-09-14: permit name edits while retaining immutable
system_key, governed sort order, subtotal/discount rules and section ownership.
No AI, imports, templates, recommendations, polling, new lifecycle/entities, price permissions or live 1C.

## F. Interaction measurements

Counting convention: clicks exclude typing; Enter is a keyboard action. Requests below count user-facing
search/mutation actions, not a claimed total of underlying DB queries. Server dependency counts require separate inspection.

Observed ten-item batch: 1 section Add + 1 search submit + 10 checkbox selections + 1 Add = 13 pointer
actions (12 when Enter submits search), 0 modal transitions, 2 Server Actions, BODY focus after insertion.
The second ten-item batch was subsequently executed: 20 catalog rows persisted, then one material
and one service were added (22 total; section counts 20 / 1 / 1 / 0). The normalized two-batch path
needs 25 pointer actions including initial section Add (23 with Enter search), 4 Server Actions.
Automation used Enter on the final Add button as well, so actual pointer counts differ from this
normalized comparison; these are interaction-path counts, not a human stopwatch result.
For distinct-query continuous entry, baseline per item has search-submit + select + quantity-focus + add
+ search-refocus; target is 0 pointer clicks with search → Enter → quantity → Enter → next search.
Both paths retain one explicit insertion per committed item; Quick Add must not add a quantity-save round trip.
Before/after actual run evidence will be appended after implementation. No claimed speed percentage until measured.

Additional baseline evidence: at the actual Chrome viewport 1920×855, the 22-row editor has
1339 descendant DOM nodes, 209901 HTML characters, first row Y=679.5, row height=156.3125,
one complete visible row, header height=103, no page overflow. The saved-success banner is present.
One automated material cycle (result selection → quantity=10 → insertion visible) measured 3640ms,
including automation/tool overhead; focus ended at BODY. This is not human composition time.
The documented Chrome viewport override currently has no effect (1440×900 requested, DOM still
1920×855); do not count this as 1440 acceptance.

## Implementation and release gates

- Rename changes only the label; stable keys, order, subtotal/discount rules and ownership remain protected.
- Quick Add merges a product only within the same persisted section, under the existing estimate lock
  and insertion ledger. Existing line price/discount/description are retained. Batch/service semantics remain unchanged.
- The existing commercial-save temporary sort-order swap is preserved by the updated trigger.
- Local transaction test used the same production definitions for add_estimate_items_v2,
  protect_canonical_estimate_section, save_estimate_commercial_draft and recalculate_estimate_totals
  (all four SQL MD5 hashes matched). Actual insert, merge, replay, stale revision, separate sections,
  unauthorized user, rename through full Save, protected system key and grants passed; all fixtures rolled back.
- Production dry-run lists exactly 20260914181150_estimate_editor_section_names_and_quick_merge.sql.
- No new polling, jobs, scheduled calls, live 1C, price authority, RLS policy or domain entities.

Request/cost impact: continuous entry remains one search + one structural Server Action per committed
item; quantity confirmation does not require another Save. Search debounce is 250ms/minimum 2 characters,
late results are ignored, navigation/quantity typing makes no requests. Existing cheaper multi-select
batch remains available. Quick Add skips category/brand reads (existing includeFacets=false contract).
Current row stock adds two bounded repository reads (totals + confirmed arrivals) per nonempty detail
projection with stock permission, not per row, and no pricing/rate reads. Empty/unauthorized stock paths
do not read stock. Stock failure produces unknown presentation and one aggregate WARN, not a false
failed Save. No new success logging or cron cadence; no production cost improvement is claimed yet.

Local validation: 12 focused suites / 143 tests pass. TypeScript passes. Focused ESLint has
zero errors and 16 pre-existing unused-variable warnings (commercial-field redaction and
pricing test fakes). Production build compiles and prerenders all 180 static routes; diff check passes.
Quick Add also retains the secondary batch selector on mobile as a named 44px icon control.
Missing line/settings readiness opens the existing guided panel; clean composition keeps it collapsed.

Production rollout and authenticated candidate/responsive acceptance remain pending.

## Authenticated preview acceptance — 2026-09-14

Partner NOVOTECH SYSTEMS / Vasili Culacov, existing disposable KP-2026-000128.
Recovered Chrome connection now applies real viewport dimensions.

| Width × height | Overflow | First row Y | Row height | Complete rows | Minimum inspected control height |
|---|---|---|---|---|---|
| 390 × 844 | No | 552 | 197.31 | 1 | 44 |
| 768 × 1024 | No | 548 | 182.66 | 2 | 44 |
| 1440 × 900 | No | 548.5 | 94.31 | 3 | 44 |
| 1920 × 855 | No | 548.5 | 94.31 | 3 | 44 |
| 3640 × 1440 | No | 548.5 | 94.31 | 9 | 44 |

Desktop quantity columns share the same X across inspected rows. 390 and 1440 screenshots inspected;
mobile uses stacked cards and 44px controls, with the existing bottom action bar.
Comparable fresh production/preview reads of the same 22-row estimate at 1920×855, no success banner:
first Y 615.5 → 548.5; row height 156.3125 → 94.3125; complete rows 1 → 3;
header 103 → 213 (persistent composition controls); descendant DOM 1338 → 1453 (+8.6%);
HTML characters 210946 → 232396 (+10.2%, not transferred bytes). No claim of payload reduction.

Production migration 20260914181150 applied once via linked CLI; subsequent dry-run is up to date.
Security advisors: zero errors; anon cannot execute the new RPC, authenticated can subject to its
company/permission/revision checks. No policy/table changes.

Read-only search finds SKU 170110 and indicates an existing same-section line. Enter focuses
quantity. Confirming +2 preserves 22 lines, increases that exact line from 1 to 3, retains price 10.07,
and recalculates total 3064.93 → 3085.07. Automated confirmation cycle 1657ms including tool overhead.
Inline section rename and Ctrl+S persisted “Оборудование — тест UX”; exact DB read and reload confirm
name, with unchanged equipment key/order and three other sections. External no-result path opens
the existing external nomenclature picker. Works retains both installation/commissioning destinations.
Preview opens and shows quantity 3 / line amount 30.21. No browser console errors observed.

Runtime exposed two acceptance defects before release: focus attempted during a still-disabled
React transition, and preview replaced a renamed system section label with its canonical default.
Follow-up waits for the committed enabled search before focusing and uses the persisted label for
explicit system keys in new proposal DTOs. Historical frozen versions remain unchanged.
Focused regression added for an early animation frame and renamed proposal label/totals.
These fixes and continuous 10/20-item cycles require fresh browser acceptance; no production app release yet.

## Final candidate acceptance — 36507108

Both follow-up fixes passed on the stable authenticated preview. Repeating SKU 170110 in
KP-2026-000128 now preserves 22 rows, changes quantity 3 to 4, retains price 10.07, and
returns focus to `estimate-quick-search`. Its preview renders the persisted custom section name.

Created separate disposable KP-2026-000129 (`038e74ee-fe2d-49ae-9790-cdebdfb9f910`),
named `Codex UX acceptance 20260914 continuous 20`, using existing ANTIBIR customer.
No proposal was sent, no order/cart submitted, and no user estimate was deleted.

Continuous entry reached 10 then 20 distinct catalog rows, using the same 20 SKUs as the
baseline. No pointer clicks, modal transitions or scroll-to-toolbar actions were needed inside
the composition loop after initial search focus. This is keyboard workflow evidence, not a
claim that twenty separately searched items use fewer requests than a two-batch selection.
The action contract is 20 search + 20 insertion actions for 20 distinct searches (10 + 10
for ten); the retained batch path remains 2 + 2 for two ten-item batches. Counts are scoped
Server Actions, not a browser-wide request/DB trace.

Nineteen uninterrupted automation cycles were timed; the sixth cycle was excluded because
the observer checked focus before the animation frame committed and interrupted measurement.
After waiting for the actual `:focus` state, un-targeted Return confirmed the quantity and
returned to search. Fourteen subsequent cycles verified both automatic focus transitions.
Confirmation-to-search durations: 1184–1858 ms; complete search-to-next-search cycles:
2109–3269 ms, including automation overhead. No fabricated human timing or speed percentage.

Section-local Add Materials focused search in Materials. SKU 300002, quantity 10, was added
there; Works added existing Mount Camera service, quantity 2, to installation. ArrowDown/Up,
Enter, Escape, slash and Ctrl+K were exercised. Inline work price 30 and equipment quantity 2
made Save dirty and disabled structural insertion until Ctrl+S completed. Reload preserved
22 rows, quantities/prices and total USD 3075.00 (3005.30 + 9.70 + 60.00). Preview matched.
The no-result external-nomenclature path opened the existing form at 390 and was cancelled
without creating an external item. No captured console errors.

Final five-size check: 390x844, 768x1024, 1440x900, 1920x1080, 3640x1440; no horizontal
overflow, inspected quantity/price/search controls at least 44px high. Temporary viewport
override reset. Prior comparable density and DOM/HTML measurements above remain applicable;
no payload reduction is claimed. Final follow-up validation: 58 tests in four focused suites,
TypeScript, focused ESLint and production build passed. No further runtime changes since
the verified preview. Production integration/deployment is the next release gate.
