# Product Detail browser navigation lifecycle — 2026-09-01

Task: `PERF-BROWSER-NAV-LIFECYCLE-20260901`

## Verdict

The remaining latency is `I. MULTIPLE_COMBINED`, with two independently measured contributors: Flight response completion and the delayed visible frame. Browser dispatch, authentication, Flight client processing, React commit, long tasks, and new JS chunks are not dominant.

Exactly one next optimization sprint is recommended: **Product Detail Flight stream-completion sprint**. Instrument the existing RSC render/stream boundary server-side and remove serial work that delays completion of the current Flight response. Do not introduce JSON transport and do not start Catalog payload optimization. Target gain: **150–250 ms p50** if the 288 ms response-completion interval can be reduced toward the authenticated-envelope baseline.

## Setup

- Preview deployment: `e1ce42a9`, Vercel preview, Frankfurt/IAD function regions advertised by the deployment.
- Stable branch alias: `vbc-b2b-portal-git-codex-perf-brows-49db8c-thunderxp-s-projects.vercel.app`.
- Browser: Google Chrome `152.0.7977.65`, controlled through the installed browser extension.
- Session: legitimate authenticated partner session; the Product Detail page exposed the partner cabinet and private commercial workspace.
- Representative product: `DH-IPC-HFW2449TL-S-PV` (`400665`).
- Sequence: Overview → Description → Characteristics → Instructions → Retail Price History → Analytics.
- Samples: 20 click-to-visible samples per transition (100 total). A matching Flight `PerformanceResourceTiming` entry was observable for 86 samples; network-stage percentiles use only those entries. Missing resource entries remain `UNKNOWN` and were not inferred.
- Timing source: browser-native `performance.now`, `PerformanceResourceTiming`, `PerformanceObserver`, `useLayoutEffect`, and two `requestAnimationFrame` callbacks. No `Date.now` application timing was used.
- Percentile method: nearest-rank p50 and observed p95.

## Aggregate waterfall

| Stage | n | p50 | observed p95 | Approx. p50 total | Confidence |
|---|---:|---:|---:|---:|---|
| Click → dispatch (`fetchStart`) | 86 | 1.5 ms | 3.3 ms | 0.2% | High |
| Dispatch → TTFB | 86 | 150.4 ms | 185.1 ms | 22.0% | High |
| TTFB → body complete | 86 | 288.0 ms | 396.8 ms | 42.1% | High for interval; attribution within streamed response is medium |
| Body complete → React commit | 86 | 4.8 ms | 8.7 ms | 0.7% | High |
| React commit → visible frame | 100 | 233.6 ms | 244.7 ms | 34.1% | High for observed frame; production representativeness is medium |
| Click → visible | 100 | 684.5 ms | 773.3 ms | 100% | High |

The component medians sum to 678.3 ms; the small difference from the independently calculated total median is expected because percentiles are not additive.

Browser request queueing (`fetchStart → requestStart`) was 2.7 ms p50 / 4.1 ms p95. Actual request-start → TTFB was 147.0 / 182.6 ms. Dispatch is therefore immediate and the main thread is not holding navigation.

## Per-transition click-to-visible

| Transition destination | n | p50 | observed p95 |
|---|---:|---:|---:|
| Description | 20 | 656.7 ms | 803.6 ms |
| Characteristics | 20 | 673.2 ms | 772.8 ms |
| Instructions | 20 | 672.3 ms | 802.8 ms |
| Retail Price History | 20 | 681.9 ms | 755.9 ms |
| Analytics | 20 | 733.0 ms | 772.8 ms |

## Controls and Vercel envelope

| Control | n | Total p50 / p95 | Dispatch p50 / p95 | TTFB p50 / p95 | Body p50 / p95 | Server-Timing p50 / p95 |
|---|---:|---:|---:|---:|---:|---:|
| Tiny public, no-store | 20 | 132.6 / 159.6 ms | 0.2 / 0.3 ms | 130.3 / 157.9 ms | 0.8 / 1.0 ms | application 0 / 0 ms |
| Tiny authenticated, no-store | 20 | 162.8 / 248.8 ms | 0.2 / 0.3 ms | 161.0 / 246.6 ms | 0.8 / 1.1 ms | auth/application 26.5 / 49.1 ms |

Both controls returned HTTP 200, transferred 311 bytes (11 encoded body bytes), and used HTTP/2. Authentication adds about 30 ms at the median. The authenticated `Server-Timing` maximum was 181.9 ms; its TTFB maximum was 350.0 ms. The public control had one 830.8 ms cold-ish/outlier request, while its observed p95 stayed 159.6 ms. This supports a variable platform/invocation tail but not a dominant warm median.

The real Flight response used HTTP/2. Its transfer size was 4,344 bytes p50 / 4,986 bytes p95; encoded body size was 4,044 / 4,686 bytes and decoded body size was 18,187 / 25,907 bytes. Flight did not expose `Server-Timing`, so function-start versus application-start inside the streamed-response interval is `UNKNOWN`.

## Client, chunks, and paint

- No Long Tasks API entries were observed across 100 transitions.
- No new JavaScript or CSS resource downloads occurred during any measured transition.
- Body complete → React commit was only 4.8 ms p50 / 8.7 ms p95.
- There is no evidence that Flight parsing, React reconciliation, lazy module loading, or synchronous client work dominates.
- Commit → the second visible animation frame was consistently 233.6 ms p50. With no long task and no chunk activity, this is browser/frame scheduling in the preview-controlled environment, not attributable application CPU. It must not be presented as a proven production browser cost.

## Outliers

The slowest fully decomposed sample was Instructions at 988.3 ms: dispatch 0.8 ms, TTFB 291.1 ms, body completion 453.6 ms, commit 3.7 ms, visible frame 239.1 ms. No long task or chunk load occurred. Other upper-tail samples expanded either TTFB (up to 308.0 ms) or body completion (up to 410–454 ms); React commit remained below 14.8 ms and visible-frame delay remained tightly grouped below 256.6 ms.

Cold-ish first navigation after each full Product Detail load was Description. Its TTFB p95 reached 308.0 ms, but its p50 was 150.7 ms, essentially the aggregate 150.4 ms. Cold behavior therefore explains isolated TTFB tail samples, not the warm median. Later transitions retained the same large response-completion interval.

## Healthy areas to protect

- Click dispatch: 1.5 ms p50.
- Browser queueing: 2.7 ms p50.
- Auth application work: 26.5 ms p50.
- Flight transfer volume: about 4 KB encoded.
- Flight client processing plus React commit: 4.8 ms p50.
- Long tasks: none observed.
- Navigation-triggered JS/CSS chunks: none observed.
- Existing Product tab SQL/business work remains within the previously proven 126.7–172.7 ms candidate range and is not reopened by this diagnostic.

## Production comparison and limitations

Diagnostic code was intentionally never deployed to production. The established production/current-architecture Flight baseline remains Description 1,020/1,113 ms, Characteristics 906/977 ms, Instructions 915/1,057 ms, and Pricing 904/992 ms (p50/p95). A legitimate partner production session was not available in this browser, so no admin session was substituted and no new production lifecycle stages were claimed.

The preview sample proves where time occurred in this environment. It cannot split streamed-body time into Vercel runtime, server render, stream pacing, and wire delivery without a server-side boundary on the existing Flight response. That split is the bounded purpose of the recommended sprint.

## Cleanup

All temporary endpoints, controls, marks, observers, client hooks, and instrumentation were removed after measurement. Only this evidence document is retained. No production behavior or architecture changed.
