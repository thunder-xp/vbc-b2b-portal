# Product Detail tab data transport experiment — 2026-09-01

## Decision

The narrow authenticated JSON transport did not pass the production gate and was removed.

Gate: first visible activation must reach `<=300 ms` p50 or improve by `>=40%` versus the App Router Flight control.

## Runtime setup

- Partner workspace: authenticated production-like preview session.
- Product: `DH-IPC-HFW2449TL-S-PV` (`69d30a4a-3739-4d80-8008-bf86b7a1a055`).
- Control: `origin/main` commit `021a00438d5e61c77e5fc9145a4e2abf282730fa`, deployed as preview `dpl_Fh53DZ5JEkTAdEwfoFzDZ7JKuh2K`.
- Candidate: commit `b5d35fbe`, preview `dpl_HfmUV4CcEfmgd62u2Chjx3e1yttz`.
- Both paths were measured through the same authenticated stable preview hostname and browser session.
- Sample size: 20 no-store activations per tab and transport.

## Results

| Tab | Flight p50 / p95 | Candidate visible p50 / p95 | Improvement | Candidate fetch/parse p50 | Server p50 | JSON bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Description | 1020 / 1113 ms | 841 / 1493 ms | 17.5% | 261.4 ms | 126.7 ms | 3692–3694 |
| Characteristics | 906 / 977 ms | 743 / 1909 ms | 18.0% | 291.2 ms | 145.3 ms | 7231–7233 |
| Instructions | 915 / 1057 ms | 741 / 1219 ms | 19.0% | 293.9 ms | 149.5 ms | 7225–7227 |
| Retail Price History | 904 / 992 ms | 760 / 1883 ms | 15.9% | 303.8 ms | 172.7 ms | 888–890 |

The candidate's narrow request completed near 300 ms at p50, but visible activation remained 741–841 ms and tail latency regressed. It therefore passed neither branch of the gate across the required tabs.

## Correctness evidence

- Candidate tab changes issued the authenticated JSON request and did not navigate Product Detail through App Router Flight.
- Direct entry and refresh server-rendered the requested tab.
- Back and Forward restored Description and Characteristics through canonical query history.
- Legacy `tab=relations` normalized to the Analogues presentation.
- A superseded Description request could not overwrite a subsequent Retail Price History activation.
- The mounted identity, product action rail, canonical `returnTo`, and RU presentation remained intact during candidate switches.
- The route reused server-side authorization and catalog/pricing actions; browser input was limited to product UUID and governed tab.

## Proven next bottleneck

Transport was not the dominant remaining delay. The candidate still spent 126.7–172.7 ms p50 in the server-authorized tab read, while visible activation added roughly 450–580 ms beyond the instrumented fetch/parse boundary and had 1.2–1.9 s p95 outliers. The next investigation should isolate request dispatch/edge invocation and React commit-to-visible timing with browser-native marks before changing payload shape or catalog reads. Catalog payload optimization remains out of scope until that lifecycle timing is proven.
