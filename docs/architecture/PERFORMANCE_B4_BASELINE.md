# Performance Optimization Stage B4 Baseline

## Deployment

- Deployment: `dpl_DdN1UA8PRxo7foCXMxXbMfC7o74x`
- Commit: `d85b62975430b581fba57475764cffb7a2c7bc5c`
- Route: `/cabinet/catalog?attr.property_42aecb86-8fc1-11ec-ba8b-7239d3b7bd5c=4&sort=price_asc`
- Trace: `Trace-20260720T221944.json.gz`
- Execution path: `fra1::fra1`; the previous `fra1 -> iad1` cross-region path is absent.

## Browser Baseline

| Metric | Baseline |
| --- | ---: |
| Navigation to document commit | ~520 ms |
| FCP | ~614 ms |
| LCP | ~947 ms |
| CLS | 0 |
| Long tasks over 50 ms | 0 |
| Largest main-thread task | ~39.8 ms |
| Initial requests | 23 |
| Initial transfer | 909,893 bytes |
| Initial decoded bytes | 1,599,639 bytes |
| Initial JavaScript transfer | 204,682 bytes |
| Initial image transfer | 671,754 bytes |

## Image Evidence

The eight images requested before LCP were fetched directly from Firebase Storage. Every response used `cache-control: private, max-age=0`; no responsive `srcset` was emitted by the catalog card image element.

| Encoded size | Source shape |
| ---: | --- |
| 217.2 KB | original JPEG |
| 209.9 KB | original PNG |
| 65.7 KB | thumbnail PNG |
| 53.1 KB | original PNG |
| 39.1 KB | thumbnail PNG |
| 38.3 KB | original PNG |
| 17.3 KB | original PNG |
| 15.6 KB | thumbnail PNG |

## Interaction Evidence

- Catalog RSC interactions: ~527-827 ms for representative filter/category requests.
- Product-detail RSC interactions: repeated requests were observed; trace values ranged from roughly 667 ms to 1,142 ms at the browser layer.
- Search: `q=14` took ~601 ms for a 311-byte response; `q=2108` took ~296 ms for a 2,308-byte response.
- Product links already use `prefetch={false}`. The repeated detail requests followed explicit navigations and tab interactions, not a product-card auto-prefetch storm.

## Optimization Boundaries

- Authenticated HTML and RSC remain private and uncached.
- Partner prices, stock visibility, carts, orders, estimates, finance, and company context must never enter a shared cache.
- Safe optimization targets are image derivatives, request-scoped memoization, compact read projections, bounded queries, and independent streaming boundaries.

