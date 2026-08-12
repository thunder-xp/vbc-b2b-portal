# Installation Marketplace Domain

## Purpose and Boundary

The Installation Marketplace owns the Portal-side detailed installation scope, provider eligibility, offer history, execution, and operational settlement. It is independent from the paid Retail Order and Payment lifecycle. It is not CRM, bidding, or project-management software.

## Installation Tariffs

Novotech governs fixed customer-facing installation prices. Published tariff versions define service type, applicable system, unit, retail rate, VAT treatment, effective interval, publication status, and audit history.

The calculator may use only an explicitly published version. Retail Order and Installation Requirement snapshot the applied result. Installers cannot bid or define customer retail prices, and existing paid orders are never recalculated from current tariffs.

## Installation Provider

`InstallationProvider` has two types:

- `partner_company`, referencing an existing active partner company;
- `internal_team`, referencing an internal operational team identity.

Exactly one backing identity is valid. Novotech's internal department is never represented as a fake partner company. Both provider types implement the same eligibility, assignment, and execution contracts while authorization remains type appropriate.

## Provider Profile and Eligibility

Marketplace profile data includes participation and approval status, public name/logo/description, service regions, system competencies, capabilities, capacity, availability, response SLA, temporary unavailability, suspension, quality state, and eligibility version.

B2B memberships and effective permissions determine who may operate a partner provider. Marketplace eligibility determines whether the provider may receive work. Neither substitutes for the other.

Public profile projections expose only approved presentation facts and safe availability. They never expose B2B prices, contracts, debt, compensation, margin, internal scores, 1C references, or another partner's activity.

## Installation Requirement

A requirement is derived from the locked customer purchase and planned before payment where useful, but it is activated and dispatched only after verified payment. It snapshots:

- Retail Order and system type;
- installation address and governed geography;
- detailed work types, quantities, units, and rates;
- required competencies;
- requested scheduling period and customer instructions;
- fixed customer installation charge, tariff version, and calculation version;
- provider-selection mode and initially preferred provider.

Detailed camera installation, cable laying, commissioning, and remote configuration remain Portal-owned. Future 1C export contains one aggregate service only.

## Requirement Lifecycle

```text
planned -> activation_pending -> assignment_pending
assignment_pending -> offered -> assigned
assigned -> execution_in_progress
execution_in_progress -> confirmation_pending
confirmation_pending -> completed | disputed
planned | assignment_pending | offered | assigned -> cancelled
```

Payment, Retail Order, 1C export, assignment-attempt, execution, and settlement state remain separate.

## Assignment Attempts

Every provider offer is immutable historical evidence:

```text
offered -> accepted | declined | timed_out | withdrawn
```

An attempt records requirement, ordinal, provider, offer/deadline, status, terminal reason/timestamps, source of selection, ranking-evidence version, and provider compensation snapshot. Exactly one non-terminal attempt may exist per requirement. Terminal attempts are not reopened or overwritten.

## Selection and Reassignment

Hard filters are active status, Marketplace approval, CCTV competence, geographic coverage, capacity, and no suspension. MVP ranking uses deterministic geography specificity, lowest governed workload ratio, oldest last-offered timestamp, and stable provider ID. AI is prohibited.

A customer-selected provider is revalidated when activation begins. Customer selection and automatic dispatch serialize on the requirement.

Partner decline or timeout closes the attempt and creates a new attempt for the next eligible partner. If none exists, dispatch falls back to an eligible internal team. If none is available, an internal operational incident is created. Retail Order and Payment remain unchanged. The customer sees a safe status such as `Подбираем монтажную команду`, not rejection details.

## Privacy Transition

Before acceptance, a candidate provider may see only approximate locality, system and work scope, requested period, expected provider compensation, SLA, and acceptance deadline.

Acceptance is an explicit authorization transition. Only then may the provider access the minimum customer name, phone, exact address, instructions, and installation detail needed for execution. Other providers retain zero visibility.

## Execution Lifecycle

```text
scheduling -> scheduled -> in_progress
in_progress -> completed_by_provider
completed_by_provider -> customer_confirmation_pending
customer_confirmation_pending -> customer_confirmed | issue_reported
issue_reported -> disputed -> resolved
```

Partners may accept, decline, schedule, start, complete, and attach governed completion evidence. The workflow does not add leads, activities, tasks, calls, or general project management.

Customer confirmation shows the assigned installer, schedule, progress, and completion. Any auto-confirmation timeout is an approved configurable policy and applies only when no dispute exists.

## Commission and Settlement

Customer retail price and provider compensation are separate. A versioned commission rule supports percentage or fixed-amount methods and may be tariff specific:

```text
customer installation charge
- governed Novotech commission
= provider payable
```

The compensation snapshot must be established before an offer is shown to a provider; the recommended business checkpoint is paid-order activation. Rule changes never silently alter an existing offer or settlement.

Operational settlement lifecycle:

```text
not_eligible -> accrued -> blocked | payable_ready
payable_ready -> exported_to_1c -> reconciled -> paid
accrued | blocked | payable_ready -> adjusted
```

Settlement becomes eligible only after provider completion, customer confirmation or approved timeout policy, and no active dispute. Portal owns operational accrual and evidence; 1C owns official accounting, payable, reconciliation, and payment truth.

## Conceptual Persistence Contract

- `installation_tariffs`: immutable published tariff versions with non-overlapping applicability.
- `installation_commission_rules`: immutable published percentage/fixed rule versions.
- `installation_requirements`: one activated CCTV requirement per MVP order, revisioned current state and assignment pointer.
- `installation_requirement_lines`: immutable detailed work snapshots after activation.
- `installation_providers`: unique partner-company or internal-team backing identity.
- `installation_provider_profiles`: revisioned eligibility and public/internal metadata.
- `installation_provider_regions` and `installation_provider_competencies`: governed unique provider/scope mappings.
- `installation_assignment_attempts`: immutable terminal offer history, unique requirement ordinal and one active-attempt constraint.
- `installation_executions`: one revisioned execution per accepted attempt.
- `installation_execution_events`: append-only execution evidence.
- `installation_settlements`: one governed current settlement per completed assignment with immutable calculation references.

RLS and services derive provider/customer/internal scope server-side. No provider can discover another provider's offer, compensation, customer, workload, or usage through list, detail, search, export, or error behavior.
