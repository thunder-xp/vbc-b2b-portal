# Product Detail Flight stream completion — 2026-09-02

Task: `PERF-PDP-FLIGHT-STREAM-20260902`

Status: `NOT_COMPLETED`. The scheduling candidate improved the comparable preview median, but failed the explicit performance gate and was fully removed. No production deployment occurred.

## Measurement setup

- Authenticated partner session, same product `DH-IPC-HFW2449TL-S-PV` and stable Vercel preview alias.
- Chrome 152 browser-native `PerformanceResourceTiming`, `performance.now`, layout-effect commit mark, and animation-frame visibility mark.
- Sequence: Description, Characteristics, Instructions, Retail Price History, Analytics.
- Ten click-to-visible samples per destination before and after (50 each); network-stage statistics include only samples with an observable matching Flight resource entry (39 before, 45 after). Missing stages were not inferred.
- Preview-only server traces timed every Product Detail await with `performance.now` and were correlated by deployment, request path, tab, and sampling interval.
- Accepted original lifecycle baseline remains 288.0/396.8 ms stream p50/p95 across 86 observed Flight resources. The immediate same-preview control baseline was 225.0/379.0 ms and is used for the candidate comparison.

## Original execution map

The Product Detail page has no internal Suspense boundary. The cabinet layout can begin the route response while the async page continues. The original page await waves were:

1. Route identity: typically 80–100 ms.
2. Product detail, workspace, merchandising, and active-tab reads in parallel. Product detail was typically 33–70 ms; merchandising 20–38 ms; workspace completed around 166–202 ms from page start.
3. Favorites after workspace/product: typically another 23–47 ms, completing around 192–225 ms.
4. Analytics competitive intelligence: another 24–27 ms after favorites, completing around 225–255 ms.

Overview additionally waits for commercial views and then competitor pricing, but that path was not part of the five-transition performance gate.

| Operation | Dependency | Active-tab need | Classification |
|---|---|---|---|
| Route identity | slug + authenticated user | all | `BLOCKS_FINAL_CHUNK` |
| Product detail projection | identity | all; projection is tab-bounded | `BLOCKS_FINAL_CHUNK` |
| Workspace/capabilities | authenticated user; also required by cabinet layout | all | `BLOCKS_FIRST_BYTE` / `BLOCKS_FINAL_CHUNK` |
| Merchandising | product identity | all current headers | `BLOCKS_FINAL_CHUNK` |
| Favorites | workspace permission + product | all except relations | `BLOCKS_FINAL_CHUNK`; proven serial tail |
| Retail history | identity | pricing only | `BLOCKS_FINAL_CHUNK`; already parallel and fast |
| Competitive intelligence | workspace company/permission + identity | analytics only | `BLOCKS_FINAL_CHUNK`; proven serial tail |
| Relations/summary/knowledge/commercial | identity | correctly limited to overview/relations | `NON_BLOCKING` for measured tabs |

No inactive-tab reads were observed on Description, Characteristics, Instructions, Pricing, or Analytics. Product projections correctly omit images, attributes, documents, commercial data, history, relations, and intelligence when the active tab does not require them.

## Candidate

The candidate started the existing request-scoped workspace promise at page entry and chained permission-dependent favorites and Analytics intelligence from it inside the primary batch. It did not change queries, RLS, DTOs, browser authority, caching scope, or business semantics. A focused test proved workspace started before identity completed and favorites began without waiting for product detail.

The candidate exposed an important constraint: workspace was already request-memoized with the cabinet layout. Starting the page consumer earlier measured the full shared workspace promise (roughly 140–166 ms) rather than the remaining 84–105 ms seen after identity. It did not eliminate that critical request boundary. Favorites still added roughly 23–29 ms after workspace; Analytics intelligence overlapped favorites but still depended on workspace.

## Before/after browser result

| Stage | Before p50 / p95 | Candidate p50 / p95 | Result |
|---|---:|---:|---:|
| Dispatch → TTFB | 146.8 / 190.4 ms | 145.0 / 189.5 ms | unchanged |
| TTFB → body complete | 225.0 / 379.0 ms | 187.5 / 220.9 ms | 16.7% p50 improvement; tail improved |
| Body complete → commit | 5.0 / 8.0 ms | 4.9 / 9.0 ms | unchanged |
| Commit → visible | 19.4 / 27.0 ms | 20.1 / 27.7 ms | unchanged |
| Click → visible | 401.6 / 558.1 ms | 355.7 / 452.0 ms | 11.4% p50 improvement |

Relative to the accepted 288.0 ms original stream baseline, 187.5 ms is a 34.9% reduction—still below 40% and above 150 ms. The candidate therefore fails both alternatives of the gate.

## Tab-by-tab candidate result

| Destination | Stream p50 / p95 | Click → visible p50 / p95 |
|---|---:|---:|
| Description | 184.8 / 227.8 ms | 359.8 / 459.7 ms |
| Characteristics | 190.5 / 220.9 ms | 356.3 / 402.3 ms |
| Instructions | 178.3 / 241.2 ms | 352.6 / 452.0 ms |
| Retail Price History | 182.4 / 201.5 ms | 352.4 / 385.5 ms |
| Analytics | 189.2 / 208.9 ms | 366.8 / 469.3 ms |

No sample exceeded twice the candidate median. P95 materially improved rather than regressed.

## Suspense, transformation, and client findings

- There is no Product Detail internal Suspense boundary to audit or remove.
- Adding Suspense around favorites/intelligence would move their chunks later but would not reduce final Flight completion, the sprint's target.
- Product DTO construction/serialization was not material: encoded Flight remained about 4 KB in the accepted lifecycle evidence, and body-complete → commit stayed about 5 ms.
- No new JS/CSS chunks or long tasks were observed. Commit/visible was not optimized.

## Correctness and security

The candidate preserved auth UID authority, server-derived company/permissions, RLS, request-scoped caching, commercial privacy, and active-tab projections. Nine focused page/orchestration tests passed, including pricing, history, analytics, relations, document projection, favorites, and concurrency. TypeScript and focused ESLint passed before preview deployment.

Because the performance gate failed, the candidate did not proceed to production, full responsive/business acceptance, or production benchmarking. All candidate code, preview routes, marks, observers, logs, and diagnostic UI were removed. No migration or database change was created.

## Decision

The proven serial scheduling existed, and removing it improved p50 and p95, but it was not the dominant enough contributor required by the task. The remaining server-side critical boundary is the shared partner workspace resolution followed by product action-state reads. The only next recommendation is a **request-scoped Product Detail workspace/action-state consolidation sprint**: reuse one resolved workspace result across cabinet shell and Product Detail consumers and return the permission-gated initial favorite state without a second post-workspace request boundary. It must retain server authority and be gated independently before any Catalog work.

Final verdict: `NOT_COMPLETED`; evidence retained, prototype removed, production unchanged.
