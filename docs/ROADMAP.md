# Roadmap

## Foundation

- Establish project documentation and architecture boundaries.
- Create source folder structure by domain.
- Keep the default application clean and free of business features.
- Define rules for future development and integrations.

## Auth & Roles

- Add Supabase authentication.
- Define user roles for partner users, Novotech managers, and administrators.
- Keep role checks separate from partner access-depth checks.
- Ensure one user belongs to only one partner company.

## Partner Companies

- Add partner company model and management flow.
- Support multiple users per partner company.
- Allow Novotech managers to manually assign access profiles.
- Keep 1C as the source of truth for partner company master data.

## Catalog Cache

- Define catalog cache tables and synchronization strategy.
- Import product data from 1C into portal cache.
- Track cache freshness and sync status.
- Avoid portal-side product master-data editing.

## Pricing & Stock Visibility

- Cache or fetch price and stock data from 1C according to the chosen integration strategy.
- Apply partner access profiles before showing prices, availability, stock depth, reservations, debts, or credit limits.
- Keep commercial values aligned with 1C.

## Cart & Orders

- Add cart and order draft workflows.
- Validate partner access and availability before submission.
- Keep the portal responsible for order creation UX, not accounting ownership.

## 1C Order Creation

- Implement order submission to 1C.
- Implement product reservation writes where required for MVP.
- Add audit logging and failure handling for 1C write operations.
- Keep all other 1C writes out of MVP scope.

## Admin Controls

- Add manager/admin interfaces for partner access depth.
- Add visibility controls and operational settings.
- Add monitoring surfaces for sync status and failed 1C operations.
