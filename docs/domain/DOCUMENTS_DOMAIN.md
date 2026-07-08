# Documents Domain

## Business Goals

The documents domain defines how the Novotech Partner Platform gives partners controlled access to business, product, technical, and commercial documents.

Novotech distributes professional security equipment, so documents are important for product selection, installation, compliance, warranty support, accounting, and partner operations.

The main business goals are:

- Give partners fast access to documents they are allowed to see.
- Protect accounting, commercial, warranty, and partner-specific documents.
- Keep 1C as the source of truth for invoices, fiscal invoices, delivery notes, and official accounting documents.
- Support product documents such as certificates, installation guides, datasheets, and warranty files.
- Let the portal control visibility by partner company, access profile, partner status, and document type.
- Make document search and downloads reliable without exposing restricted information.
- Avoid turning the portal into a document master system unless a document type is explicitly portal-owned.

## Core Entities

### Product Document

A product document is a file connected to a product.

It may include technical, compliance, installation, warranty, or marketing information. Visibility depends on document type, product visibility, and partner access profile.

### Invoice

An invoice is an official accounting document related to an order or financial transaction.

Invoices belong to 1C and are visible in the portal only when accounting document permissions allow it.

### Fiscal Invoice

A fiscal invoice is an official tax or fiscal document.

It is sensitive accounting data and belongs to 1C. The portal may display or allow download only for authorized partners.

### Delivery Note

A delivery note confirms shipment, delivery, or transfer details.

It belongs to 1C or the approved fulfillment/accounting source. Visibility should be tied to order/document permissions.

### Warranty

A warranty document describes warranty terms, product coverage, or warranty confirmation.

Some warranty documents may be product-general, while others may be order-specific or partner-specific. Access rules must reflect that difference.

### Certificate

A certificate is a compliance or quality document for a product, product family, or batch.

Certificates may be broadly useful for partners but still require visibility control when tied to restricted products or partner-specific contexts.

### Installation Guide

An installation guide explains product installation, configuration, wiring, setup, or operational use.

Installation guides are usually product-facing documents and may be accessible when the partner can see the product and product documents are enabled.

### Datasheet

A datasheet contains technical specifications and structured product information.

Datasheets support partner selection and technical validation. They should be searchable and connected to the relevant product.

### Marketing Material

Marketing material includes brochures, campaign files, product presentations, images, and promotional content.

Marketing visibility may depend on partner access profile, promotion visibility, brand relationship, or campaign targeting.

### Price List

A price list is a commercial document that lists prices or price conditions.

Price lists are sensitive. They should be visible only when price-list access is explicitly enabled, and they must not expose individual prices or commercial terms to unauthorized partners.

## Document Lifecycle

### Source Creation

Documents are created in 1C or another approved source system, depending on document type.

Product and marketing documents may come from approved media or content sources. Accounting documents must come from 1C or approved accounting source.

### Synchronization

The portal may import document metadata, file references, document types, product links, order links, and partner visibility context.

The portal should store synchronization timestamps and source references where relevant.

### Visibility Assignment

Document visibility is determined by document type, partner access profile, partner status, related product visibility, related order ownership, and finance/document permissions.

### Publication

A document becomes partner-visible only after source data is available and access rules allow display.

Publication in the portal does not change source ownership.

### Update

When a document changes in the source system, the portal should refresh metadata, version, file reference, and visibility.

Partners should not receive outdated critical documents when a newer required version exists.

### Archive

Archived documents may remain available for historical orders, warranty, or compliance needs.

Archive behavior depends on document type and business policy.

## Access Permissions

Document access should be controlled at the partner company level.

Permissions may include:

- Product document visibility.
- Product certificate visibility.
- Installation guide visibility.
- Datasheet visibility.
- Marketing material visibility.
- Price list visibility.
- Order document visibility.
- Accounting document visibility.
- Invoice and fiscal invoice visibility.
- Delivery note visibility.
- Warranty document visibility.

Rules:

- Partner status is checked before document access.
- Suspended partners should not receive normal document access unless explicitly allowed.
- Product documents require product visibility unless business policy allows public technical files.
- Accounting documents require finance/document permission.
- Order documents require the order to belong to the partner company.
- Price lists require explicit price-list or price visibility permission.
- Hidden documents must not appear in search, previews, exports, notifications, or download links.

## Documents From 1C

1C owns official commercial and accounting documents, including:

- Invoices.
- Fiscal invoices.
- Delivery notes.
- Accounting documents.
- Order-related documents maintained in 1C.
- Price lists if maintained in 1C.
- Warranty documents if generated or stored in 1C.
- Product documents if 1C is the official source.

The portal may cache metadata and file references but must treat these documents as source-owned.

## Documents Owned Only by Portal

The portal may own document-related experience data, including:

- Partner-facing document labels.
- Document visibility settings.
- Download history.
- Search indexing metadata.
- Document grouping for portal navigation.
- Notification state for newly available documents.
- Portal-only manager notes about document visibility.
- User preferences for document notifications.

The portal should not create official accounting documents or fiscal documents.

## Versioning

Document versioning should make it clear which file is current and which files are historical.

Versioning rules:

- Source system version should be preserved when available.
- Portal-generated display version must not override source truth.
- Updated documents should replace current display only after successful sync.
- Historical versions may remain available if required for compliance, warranty, or order history.
- Partner downloads should use the version visible and allowed at the time of access.
- Critical document version changes may trigger future notifications.

## Downloads

Downloads must respect access permissions.

Rules:

- Download links should not bypass access checks.
- Download access should be evaluated at request time, not only when the page is loaded.
- Sensitive downloads such as invoices and price lists should be logged.
- Expiring links or signed access may be used in future implementation.
- Bulk download should require explicit permission and extra care.

## Search

Document search should support practical partner workflows.

Search may include:

- Product article or SKU.
- Product name.
- Brand.
- Category.
- Document type.
- Order number.
- Invoice number where permitted.
- Certificate or datasheet title.
- Warranty reference.

Search must apply document visibility before results are shown. Restricted documents should not be discoverable through search metadata.

## Future Extensions

Possible future extensions include:

- Document subscriptions by product, brand, or order.
- Notifications when new product certificates or datasheets become available.
- Signed download links.
- Bulk document packages for projects or orders.
- Document expiry reminders.
- Compliance document dashboards.
- Partner-specific marketing material libraries.
- Multi-language document versions.
- OCR and full-text search for allowed documents.
- Manager approval workflow for sensitive document access.
- Document access audit reports.

Future extensions must preserve access control and source ownership boundaries.
