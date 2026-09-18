# Installation Marketplace Pilot Runbook

## Purpose

Launch a bounded installation-supply pilot without inventing readiness, changing Ranking V2, or contacting Partners automatically.

## Production calibration — 2026-09-18

Read-only calibration source: the canonical production Partner, Installation Marketplace, capability, service-area, invitation, and pilot-configuration tables. Calibrated at `2026-09-18T11:13:25Z`.

| Fact | Current value |
| --- | ---: |
| Active B2B Partner companies | 47 |
| Public directory profiles | 28 |
| NOT_ENROLLED | 44 |
| DRAFT | 2 |
| PENDING_REVIEW | 0 |
| APPROVED | 0 |
| ACTIVE | 1 |
| SUSPENDED | 0 |
| REJECTED | 0 |
| ACTIVE + available | 1 |
| ACTIVE + limited | 0 |
| ACTIVE + unavailable | 0 |
| Existing invitations | 0 |

The only factual active coverage is `MD-CU / Chișinău × cctv`: one ACTIVE, available provider with a verified CCTV capability. The provider is `ALERT-SS SRL`; its ACTIVE state must not be changed by outreach preparation.

There are no persisted pilot-configuration rows. The canonical supply projection therefore exposes the existing effective default threshold of 3 while the cell remains disabled. For `Chișinău × cctv`, current ACTIVE = 1, current AVAILABLE = 1, effective target = 3, and gap = 2. If enabled today the cell would be `LIMITED`; the customer pilot remains `NOT_READY` because one provider does not provide real customer choice.

Other non-zero factual coverage in Chișinău is held only by a DRAFT provider and is not active supply: access control, intercom, network, and other. No active coverage exists for those capabilities.

## First controlled outreach wave — owner approval required

This wave is an onboarding invitation shortlist, not a claim that the companies are already qualified installers. Every proposed company is an active B2B Partner with a complete visible public directory profile, a verified invitation recipient, no prior Marketplace invitation, and no active Marketplace enrollment. No revenue, purchase volume, discount, or relationship signal was used.

Because production has no governed capability, service-area, certification, or installation-outcome evidence for these NOT_ENROLLED companies, all such fields remain explicitly unproven. The selection uses the smallest blocker count available among sendable NOT_ENROLLED companies, stable alphabetical tie-breaking for RU, and one equally ready RO recipient so both governed locales are represented. It is not an installer-quality ranking.

| Group | Company | Locale | State | Public profile | Capability / verification | Service area | Availability | Terms | Privacy | Admin review | Classification | Exact missing steps |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | AXA-SUD S.R.L. | RU | NOT_ENROLLED | visible, complete | none declared; not verified | none declared | unavailable until onboarding | not accepted | not acknowledged | not reviewed | READY_TO_INVITE | NOT_ENROLLED, CAPABILITIES, SERVICE_AREA, CONTACT_PERSON, MARKETPLACE_TERMS, CUSTOMER_PRIVACY |
| A | BAY KUS SERVICE | RU | NOT_ENROLLED | visible, complete | none declared; not verified | none declared | unavailable until onboarding | not accepted | not acknowledged | not reviewed | READY_TO_INVITE | NOT_ENROLLED, CAPABILITIES, SERVICE_AREA, CONTACT_PERSON, MARKETPLACE_TERMS, CUSTOMER_PRIVACY |
| A | COMODA TRADE | RU | NOT_ENROLLED | visible, complete | none declared; not verified | none declared | unavailable until onboarding | not accepted | not acknowledged | not reviewed | READY_TO_INVITE | NOT_ENROLLED, CAPABILITIES, SERVICE_AREA, CONTACT_PERSON, MARKETPLACE_TERMS, CUSTOMER_PRIVACY |
| A | COMPLEX-IT HARDWARE | RU | NOT_ENROLLED | visible, complete | none declared; not verified | none declared | unavailable until onboarding | not accepted | not acknowledged | not reviewed | READY_TO_INVITE | NOT_ENROLLED, CAPABILITIES, SERVICE_AREA, CONTACT_PERSON, MARKETPLACE_TERMS, CUSTOMER_PRIVACY |
| A | DELADEIA-COM | RU | NOT_ENROLLED | visible, complete | none declared; not verified | none declared | unavailable until onboarding | not accepted | not acknowledged | not reviewed | READY_TO_INVITE | NOT_ENROLLED, CAPABILITIES, SERVICE_AREA, CONTACT_PERSON, MARKETPLACE_TERMS, CUSTOMER_PRIVACY |
| A | LEOTECHNOLOGY S.R.L. | RO | NOT_ENROLLED | visible, complete | none declared; not verified | none declared | unavailable until onboarding | not accepted | not acknowledged | not reviewed | READY_TO_INVITE | NOT_ENROLLED, CAPABILITIES, SERVICE_AREA, CONTACT_PERSON, MARKETPLACE_TERMS, CUSTOMER_PRIVACY |

`READY_TO_INVITE` means only that governed IN_APP/EMAIL outreach can be addressed safely. It does not mean ready for customer assignment. Capability, geography, terms, privacy, contact, availability, submission, and Admin verification remain Partner/Admin-owned steps.

### Existing started candidates — do not reinvite

| Group | Company | State | Factual readiness | Classification | Exact missing steps |
| --- | --- | --- | --- | --- | --- |
| B | LEONID PLUGARU | DRAFT | available; Chișinău; CCTV/access control/intercom/network/other self-declared; terms and privacy accepted | NEEDS_PROFILE | PUBLIC_PROFILE, then Partner submission and ADMIN_VERIFICATION |
| C | IGOR SPATARI | DRAFT | no capability or service area; unavailable; terms/privacy not accepted | NEEDS_PARTNER_ACTION | PUBLIC_PROFILE, CAPABILITIES, SERVICE_AREA, MARKETPLACE_TERMS, CUSTOMER_PRIVACY, ADMIN_VERIFICATION, AVAILABILITY |

There are no PENDING_REVIEW candidates. Admin must not accept terms, privacy, or self-declare capabilities for either DRAFT Partner.

### Invitation previews

Proposed channels for every Group A candidate: `IN_APP` and `EMAIL`. `SMS` remains disabled. Deep link: `/cabinet/installation-marketplace`.

RU in-app preview:

- Title: `Заявки на монтаж от клиентов NSD`
- Message: `Novotech приглашает вашу компанию добровольно подключиться к разделу «Монтаж и заявки». Вы сами выбираете компетенции, регионы обслуживания и доступность. Подтверждённые отзывы формируют будущую видимость и репутацию в Marketplace; объём заявок не гарантируется.`
- CTA: `Открыть монтаж и заявки`

RU email preview:

- Subject: `Приглашение в сеть монтажников Novotech`
- Body: `[Компания], Novotech приглашает вашу компанию получать заявки на монтаж от конечных клиентов NSD. Участие добровольное: вы самостоятельно выбираете компетенции, регионы обслуживания и текущую доступность. Публичный профиль и подтверждённые отзывы формируют будущую видимость и репутацию в Marketplace. Объём заявок не гарантируется.`
- CTA: `Открыть монтаж и заявки`

RO in-app preview:

- Title: `Solicitări de instalare de la clienții finali NSD`
- Message: `Novotech invită compania dvs. să participe voluntar în secțiunea „Montaj și solicitări”. Alegeți independent competențele, zonele de deservire și disponibilitatea. Recenziile verificate vor forma vizibilitatea și reputația viitoare în Marketplace; volumul solicitărilor nu este garantat.`
- CTA: `Deschide montaj și solicitări`

RO email preview:

- Subject: `Invitație în rețeaua de instalatori Novotech`
- Body: `[Companie], Novotech invită compania dvs. să primească solicitări de instalare de la clienții finali NSD. Participarea este voluntară: alegeți independent competențele, zonele de deservire și disponibilitatea curentă. Profilul public și recenziile verificate vor forma vizibilitatea și reputația viitoare în Marketplace. Volumul solicitărilor nu este garantat.`
- CTA: `Deschide montaj și solicitări`

No invitation draft or delivery record has been created. Owner approval must name the exact companies that may be contacted before any governed invitation preparation or send action is executed.

## Preflight

1. Open Admin → Retail Installation → Supply pilot with `admin.retail_marketplace.view`.
2. Confirm total Partner, profile, potential, invited, started, pending, active and availability counts are plausible against the current Partner directory.
3. Review every enabled Region × Capability row. Set its minimum active-installer threshold deliberately; disabled rows do not contribute to pilot readiness.
4. Confirm the existing active provider remains ACTIVE, available/limited as intended, and unchanged.

## Candidate review

1. Search or filter the bounded candidate list.
2. Inspect factual blockers, self-declared versus verified capabilities, service areas, public-profile state and recipient readiness.
3. Do not treat a public profile, company address or self-declaration as certification or geography evidence.
4. Do not create fake jobs, completions, reviews, ratings or availability to improve readiness.

## Invitation workflow

1. Open “Подготовить приглашение”. Choose RU/RO and optionally EMAIL; IN_APP is mandatory.
2. Save `INVITATION_DRAFT` for review, or mark `READY_TO_SEND`. Neither operation sends.
3. Verify company, recipient evidence, locale, channels and expiry.
4. Use “Отправить приглашение” once. Repeated execution is idempotent. SMS is unavailable.
5. Confirm the invitation becomes SENT and the append-only audit contains the Admin actor and correlation identity.
6. Partner opt-in/submission and Admin approval/decline advance the lifecycle automatically from canonical provider state.

## Rollout gate

- `READY` means every enabled pilot cell meets its configured active-installer threshold.
- `LIMITED` permits only an explicitly bounded pilot in the covered cells.
- `NOT_READY` blocks launch; it is not overridden by UI text or manual counts.
- Ranking V2 remains the sole selection/ranking policy. Invitations never boost ranking.
- Current decision (2026-09-18): `NOT_READY`. `Chișinău × cctv` has one ACTIVE/available provider against an effective target of three, so there is no real customer choice.
- Ranking V3 calibration remains blocked until real Marketplace outcomes exist. Current evidence is zero projects, assignments, verified reviews, ranking decisions, and exposure records.

## Owner approval gate

Before outreach, the owner must explicitly approve a subset of the exact Group A company names above. Approval is company-specific and does not authorize SMS, auto-enrollment, capability fabrication, Partner-owned acceptance, Admin approval, or pilot activation.

After approval, use the existing Admin supply workspace to prepare the selected invitation previews. Preparation and send are separate governed actions. Recheck the candidate state immediately before sending; do not contact a company that has since enrolled, lost its active recipient, or already received an invitation.

## Rollback and incident response

- Disable affected pilot cells; do not delete providers, invitations or audit events.
- Suspend a provider only through the existing governed activation review when justified.
- Preserve the last-good active provider and all assignments.
- If durable email persistence fails after in-app creation, the Admin UI reports the in-app-only outcome. Investigate the existing communication diagnostics; do not resend blindly.
- For data leakage, unauthorized outreach or cross-company evidence, stop the pilot, retain audit IDs, and follow the security incident process.
