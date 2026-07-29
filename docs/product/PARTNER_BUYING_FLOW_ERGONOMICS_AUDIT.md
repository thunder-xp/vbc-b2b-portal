# Partner Buying Flow Ergonomics Audit

Audit date: 2026-07-29

The audit used the production route structure and rendered component DOM. An
authenticated production browser session was not available to the implementation
environment, so production interaction and performance measurements remain
release acceptance items.

| Route / surface | Evidence | Persona | Proven issue | Business impact | Correction | Regression risk |
| --- | --- | --- | --- | --- | --- | --- |
| `/cabinet/catalog` and discovery results | `ProductCard` rendered the image before merchandising labels and placed an icon-only cart button beside secondary actions. | Partner buyer | The primary purchase action was visually equivalent to tools such as Favorites and comparison. | Slower product scanning and avoidable misclicks. | Use one stable card hierarchy and a full-width labelled cart action. | Card height and mobile wrapping. |
| Grid and list catalog presentations | Both surfaces consume the same product/commercial batch, but card content heights varied with badges, prices, and stock labels. | Partner buyer | Action rows did not align between products. | Comparison across products was harder. | Reserve bounded rows for badges, title, price, and availability. | Longer labels must remain clamped and accessible. |
| `/cabinet/catalog/[slug]` | `ProductActions` appeared before the price and availability sections. | Installer / buyer | The buy action preceded the commercial facts needed to make the decision. | Increased uncertainty before adding to cart. | Put price, availability, quantity, and actions in the first commercial viewport; keep details below. | Preserve all existing tabs and data. |
| `/cabinet/cart` | Lines were one undifferentiated list and quantity updates required editing a field then pressing a small update button. | Buyer preparing an order | Available, arriving, and unavailable positions were not visually distinguished. | Partners could overlook fulfillment risk. | Group lines by service-derived availability and provide explicit quantity controls with recovery feedback. | Grouping must not split the order. |
| `/cabinet/cart` checkout | Submission was a compact date form labelled “Подтвердить заказ”. | Buyer / approver | The handoff to Novotech and next step were not explained. | Uncertainty around whether the action is final and where status appears. | Add a review heading, canonical explanation, comment field only if already supported, and “Отправить заказ”. | Do not alter order payload or idempotency. |
| `/cabinet/orders/[id]` | A successful portal order opened with “Заказ обрабатывается”. | Buyer | Receipt context was implicit and links back to the buying flow were secondary. | Weak confirmation after a high-value action. | Present “Заказ принят”, identifiers, status, requested date, and clear next actions. | Historical 1C orders must retain their existing status model. |

## Guardrails

- Catalog cards continue to consume the existing batched commercial projection.
- Cart grouping is presentation metadata calculated by the cart service.
- No product-level price, stock, or 1C request is introduced.
- Existing order submission, idempotency, and recovery rules remain authoritative.
- No production order is created during UI acceptance without explicit approval.
