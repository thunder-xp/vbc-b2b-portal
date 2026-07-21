# Product Line Thumbnails

## Scope

This iteration adds recognition-sized product thumbnails to cart, estimate, proposal preview, and generated proposal PDF rows. Images remain presentation-only and do not affect product identity, quantities, prices, stock, totals, or 1C payloads.

## Baseline

- Cart rows render no image. Cart detail already bulk-loads catalog products and commercial views once each, so the existing catalog result can provide the image without another query.
- The routed estimate commercial editor receives product identity snapshots but no image. Estimate detail can bulk-resolve current product images once for all product lines.
- Proposal preparation performs one bounded product-image query and stores the resolved URL in the immutable customer proposal snapshot.
- Proposal preview conditionally renders an image inside the description cell rather than a dedicated leading column.
- PDF rendering already supports a narrow image cell, bounded concurrent downloads, row non-splitting, and repeated headers. Its allowlist does not currently accept the catalog's approved Firebase origins, so production product images are rejected.
- Existing generated PDFs are immutable storage artifacts keyed by version and generation fingerprint.

## Image Source Contract

Web surfaces use the shared `ProductThumbnail` policy and prefer `image_source_url` over legacy `image_url`. Cart uses its existing bulk catalog read. Estimate detail uses one bounded bulk product read for all product IDs. Proposal preparation uses one bounded repository projection selecting only product ID and the two image URL fields.

Only product lines receive thumbnails. Service and custom lines retain their current structure. Missing or rejected images use a fixed-size neutral placeholder on web and a controlled empty cell in PDF.

## PDF Safety

PDF images are fetched only server-side from the catalog image allowlist or approved portal/storage origins. Fetches have a timeout, byte limit, MIME allowlist, redirect denial, bounded concurrency, and per-render URL deduplication. A failed image never fails PDF generation. URLs are converted to embedded data before pdfmake receives them.

Proposal versions retain their captured image reference. Ready PDFs are never regenerated or overwritten, so an image change cannot alter a previously generated document.

## Performance Budget

- No image query per line and no browser-to-1C request.
- No extra cart query; one existing catalog projection supplies cart image URLs.
- At most one bounded estimate image resolution for all product lines.
- One bounded proposal image projection and one server fetch per distinct accepted URL per PDF render.
- Fixed web dimensions prevent layout shift; offscreen images remain lazy.
- PDF rows remain compact, repeat headers, and avoid splitting.

## Baseline Validation

The pre-change focused proposal preview/PDF suite passes with 1, 20, 100, and 300-line fixtures. Cart service tests confirm exactly one bulk catalog read and one bulk commercial read. Real authenticated response, image-transfer, Web Vitals, and PDF-size measurements require browser acceptance after deployment.
