# Catalog Domain

## Business Goals

The catalog domain defines how Novotech Systems presents product information to partner companies in the B2B Partner Platform.

The main business goals are:

- Give partners a reliable way to find and understand products available through Novotech distribution.
- Keep 1C as the source of truth for product master data.
- Cache product data in the portal for performance, search, filtering, and access control.
- Show different catalog depth depending on the partner company's access profile.
- Support B2B buying behavior, including repeat ordering, exact article search, analog selection, and fast order entry.
- Prepare for both product-card browsing and dense table-based ordering.
- Avoid retail ecommerce assumptions such as public pricing, public checkout, anonymous browsing, and consumer-style merchandising.

The catalog should help partners work faster while preserving Novotech's control over commercial visibility.

## Core Entities

### Product

A product is an item that Novotech can sell, reserve, or display to partners.

The product record represents the business item from 1C. It may include article number, SKU, name, brand, category, units, technical identifiers, product status, and other product master data.

### Brand

A brand identifies the manufacturer or commercial brand associated with a product.

Brand data helps partners filter products, compare alternatives, and identify familiar product lines.

### Category

A category is a navigational grouping used to help partners browse the catalog.

Categories may come from 1C or may be adapted in the portal for partner-facing navigation. Category design should support B2B discovery, not retail storytelling.

### Product Group

A product group is a business grouping of related products.

Product groups may represent product families, technical groupings, model lines, replacement groups, or internal commercial groupings. They may be useful for filtering, analogs, bundles, and future recommendations.

### Product Image

A product image is a visual representation of a product.

Images help partners confirm the correct item, but images should not be treated as the source of truth for product identity. Missing or outdated images should not block order workflows when product identifiers are clear.

### Product Document

A product document is a file related to a product, such as a certificate, manual, datasheet, declaration, drawing, or installation guide.

Document visibility may depend on partner access profile and document type.

### Product Attribute

A product attribute is a structured characteristic of a product.

Attributes may include dimensions, voltage, material, compatibility, packaging, technical parameters, or other searchable and filterable values. Attributes should be normalized enough to support filtering and comparison over time.

### Product Relation / Analog

A product relation connects one product to another.

Relations may describe analogs, replacements, accessories, compatible items, alternatives, upgrades, or related consumables. Analog relationships are especially important for B2B distribution when stock is limited or a partner searches by a known article.

### Product Availability View

A product availability view is the partner-facing representation of stock and order availability.

It is not necessarily the raw stock quantity from 1C. Depending on access profile, it may show exact quantity, simplified availability, lead-time hints, availability by warehouse, or no stock information at all.

## Product Data From 1C

1C owns official product master data, including:

- Product identifiers and article numbers.
- Product names and descriptions maintained in 1C.
- Product active or inactive status.
- Brand or manufacturer data when maintained in 1C.
- Product categories or internal groups when maintained in 1C.
- Units of measure.
- Packaging and quantity rules when maintained in 1C.
- Product availability source data.
- Product prices and price rules.
- Product analogs or replacements if maintained in 1C.
- Product documents if 1C is the document source.
- Product restrictions or commercial flags maintained in 1C.

The portal may cache this data, but it must treat it as 1C-owned.

## Product Data Enriched in the Portal

The portal may enrich catalog data for partner experience and search, including:

- Partner-facing display names or short descriptions.
- Search keywords and synonyms.
- Normalized filter attributes.
- Category mapping for partner navigation.
- Product image ordering and display preferences.
- Product document labels and grouping.
- Portal-specific badges or visibility hints.
- Partner-facing product relation labels.
- Search ranking rules.
- Manual corrections for presentation when they do not change official product identity.
- Fast-order table column preferences.

Portal enrichment must not redefine official product identity, official stock, official price, or accounting data owned by 1C.

## Visibility Rules by Access Profile

Catalog visibility is controlled by the partner company's access profile and partner status.

Possible visibility differences include:

- Whether the partner can see the product at all.
- Whether the partner can see only basic product data.
- Whether the partner can see prices.
- Whether the partner can see individual partner prices.
- Whether the partner can see exact stock quantities.
- Whether the partner can see only simplified stock availability.
- Whether the partner can see product documents.
- Whether the partner can see analogs and replacement suggestions.
- Whether the partner can see promotions or special offers.
- Whether the partner can add the product to cart or request a quote.

Rules:

- Partner status should be checked before detailed catalog permissions.
- Suspended partners should not receive normal catalog actions.
- If a product is hidden for a partner, it should not appear in catalog lists, search results, fast order lookup, recommendations, or exports.
- If price visibility is disabled, prices should not appear in product cards, tables, details, exports, or notifications.
- If exact stock visibility is disabled but availability-only access is enabled, the portal may show a simplified status instead of quantity.
- Product documents should be controlled separately from product visibility.
- Access decisions should be consistent between card view, table view, search, detail pages, and fast order flows.

## Search and Filtering Requirements

Catalog search should support B2B partner workflows where users often know exactly what they need.

Search should support:

- Product name search.
- Article number and SKU search.
- Brand search.
- Category and product group search.
- Attribute-based search.
- Search by analog, replacement, or related item.
- Partial article and exact article matching.
- Synonyms and common alternate naming where available.
- Fast lookup for copied lists of article numbers.

Filtering should support:

- Brand.
- Category.
- Product group.
- Availability view.
- Product attributes.
- Product document availability.
- Promotions if visible to the partner.
- Partner-visible product status.

Search and filtering must apply access-profile visibility before results are shown.

## Fast Order Requirements

Fast order is a future workflow for partners who already know product articles, quantities, or repeat-order lists.

Fast order should support:

- Dense table view.
- Article number input.
- Bulk paste from spreadsheets or emails.
- Quantity entry per line.
- Product match confirmation.
- Visibility-safe price and availability display.
- Analog suggestions for unavailable or discontinued products.
- Validation of minimum quantity, packaging, and unit rules.
- Clear handling of unknown articles.
- Clear handling of products hidden by access profile.
- Export or review before order submission.

Fast order is a B2B productivity workflow. It should prioritize speed, precision, and error handling over retail-style browsing.

## Product Detail Page Requirements

Product detail pages should provide a clear product reference for partners who need more information before ordering.

A future product detail page may include:

- Product name and identifiers.
- Brand and category.
- Main image and additional images.
- Partner-visible price information.
- Partner-visible availability information.
- Key attributes.
- Product documents visible to the partner.
- Analog, replacement, or related products.
- Order quantity controls if order creation is allowed.
- Reservation controls if reservation is allowed.
- Packaging or unit information.
- Warnings for unavailable, discontinued, or restricted products.

The product detail page must respect the same visibility rules as catalog lists, search results, and fast order.

## MVP Scope

The catalog MVP should include:

- Catalog cache concept based on 1C product data.
- Product list or searchable catalog foundation.
- Basic product identity fields.
- Brand and category support if available from source data.
- Access-profile-aware product visibility.
- Price and stock display controlled by access permissions.
- Basic product detail foundation.
- Product document visibility concept.
- Preparation for fast order table view, even if not fully implemented.

The MVP should focus on reliable product discovery and access-safe display rather than advanced merchandising.

## Non-Goals for MVP

The MVP should not include:

- Portal-side product master-data ownership.
- Editing official product data in the portal.
- Retail ecommerce merchandising flows.
- Public anonymous catalog browsing.
- Complex recommendation engine.
- Advanced product comparison.
- Full PIM replacement.
- Automated product content generation.
- Marketplace-style seller management.
- Customer reviews or ratings.
- Retail promotions engine.
- Full bulk order import automation unless explicitly scoped later.

## Future Extensions

Possible future extensions include:

- Advanced fast order with spreadsheet import.
- Product comparison for technical attributes.
- Partner-specific catalog views.
- Category landing pages for B2B navigation.
- Product bundles, kits, and accessories.
- Automated analog recommendations.
- Discontinued product replacement workflows.
- Personalized search ranking by partner history.
- Saved product lists and favorite items.
- Recently ordered products.
- Product availability by warehouse or region.
- Product change notifications.
- Document subscription notifications.
- Product data quality dashboard for Novotech managers.
- Integration with external product information sources.

## Risks and Edge Cases

- 1C product data may be incomplete, inconsistent, or not optimized for partner-facing search.
- Product names may differ from how partners search for items.
- Article numbers may have formatting variations, spaces, prefixes, or legacy values.
- Products may be active in 1C but intentionally hidden from some partners.
- A partner may search for a product they are not allowed to see.
- Stock may change faster than the portal cache refresh interval.
- Exact stock visibility may be disabled even when order creation is allowed.
- Product documents may contain sensitive or partner-restricted information.
- Images may be missing, outdated, or not available for all products.
- Analog relationships may be directional, incomplete, or commercially sensitive.
- Category structures from 1C may not match partner browsing expectations.
- Fast order input may include unknown articles, duplicate lines, invalid quantities, or products unavailable to that partner.
- Cached catalog data must not make the portal appear to own official product truth.
- Search exports, notifications, and API responses must follow the same access rules as the user interface.

These risks should be addressed with clear cache freshness rules, access-safe defaults, manager-visible data quality processes, and consistent catalog permission checks.
