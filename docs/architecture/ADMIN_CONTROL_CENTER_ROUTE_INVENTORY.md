# Unified Admin Control Center Route Inventory

## Rules

- `/admin` is the only internal workspace entry point.
- Every canonical route is guarded by an explicit internal permission.
- Canonical pages call existing domain services or bounded local read-model projections.
- Compatibility routes redirect and never duplicate business logic.
- Normal page rendering never calls 1C, SMTP, Auth Admin, or a service-role client.

## Canonical Routes

| Capability | Canonical route | Permission | Existing service/read model |
| --- | --- | --- | --- |
| Dashboard | `/admin` | `admin.dashboard.view` | Admin dashboard projection |
| Platform health | `/admin/platform-health` | `admin.platform_health.view` | Admin health projections |
| Companies | `/admin/companies` | `admin.companies.view` | Admin company service |
| Company detail and 1C mapping | `/admin/companies/[companyId]` | `admin.companies.view` | Admin company/access services |
| Users | `/admin/users` | `admin.users.view` | Admin identity service |
| Invitations | `/admin/invitations` | `admin.invitations.view` | Admin identity service |
| Access requests | `/admin/partner-requests` | `admin.access_requests.view` | Access approval service |
| Access inspector | `/admin/access` | `admin.security.view` | Effective-access inspector |
| Catalog | `/admin/commercial/catalog` | `admin.catalog.view` | Catalog read model |
| Prices | `/admin/commercial/prices` | `admin.prices.view` | Pricing read model |
| Stock | `/admin/commercial/stock` | `admin.stock.view` | Inventory read model |
| Arrivals | `/admin/commercial/arrivals` | `admin.stock.view` | Supplier-arrival read model |
| Rates | `/admin/commercial/rates` | `admin.rates.view` | Commercial-rate service |
| Synchronization center | `/admin/integrations` | `admin.integrations.view` | Existing sync states/actions |
| Job history | `/admin/integrations/jobs` | `admin.integrations.view` | Existing state/audit sources |
| 1C health | `/admin/integrations/1c-health` | `admin.integrations.view` | Explicit diagnostic action |
| Incidents | `/admin/integrations/incidents` | `admin.integrations.view` | Safe incident projection |
| Orders | `/admin/orders` | `admin.orders.view` | Local order-history read model |
| Planned shipments | `/admin/planned-shipments` | `admin.shipments.view` | Planned-shipment projection |
| Date changes | `/admin/date-change-requests` | `order_date_changes.review` | Existing review service |
| Reservations | `/admin/reservations` | `reservations.review` | Existing reservation review |
| Specifications | `/admin/specifications` | `specifications.review` | Existing specification review |
| Estimates and proposals | `/admin/estimates` | `admin.estimates.view` | Estimate/proposal read models |
| Finance | `/admin/finance` | `admin.finance.view` | Finance coordinator/read model |
| Audit | `/admin/audit` | `admin.audit.view` | Existing event projections |
| Security | `/admin/security` | `admin.security.view` | Effective-access projections |
| Settings | `/admin/settings` | `admin.settings.view` | Roles, permissions, schedules |

## Compatibility Routes

| Existing route | Canonical destination | Strategy |
| --- | --- | --- |
| `/admin/company-users` | `/admin/users` | Temporary redirect |
| `/admin/commercial-rates` | `/admin/commercial/rates` | Temporary redirect |
| `/admin/integrations/catalog-sync` | `/admin/integrations` | Temporary redirect |
| `/admin/reservation-requests` | `/admin/date-change-requests` | Temporary redirect |
| `/admin/access-requests` | `/admin/partner-requests` | Existing redirect/reuse |

Dynamic compatibility detail routes remain available until browser acceptance.
Historical data and domain services are not deleted.
