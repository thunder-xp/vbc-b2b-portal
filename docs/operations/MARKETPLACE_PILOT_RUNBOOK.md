# Installation Marketplace Pilot Runbook

## Purpose

Launch a bounded installation-supply pilot without inventing readiness, changing Ranking V2, or contacting Partners automatically.

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

## Rollback and incident response

- Disable affected pilot cells; do not delete providers, invitations or audit events.
- Suspend a provider only through the existing governed activation review when justified.
- Preserve the last-good active provider and all assignments.
- If durable email persistence fails after in-app creation, the Admin UI reports the in-app-only outcome. Investigate the existing communication diagnostics; do not resend blindly.
- For data leakage, unauthorized outreach or cross-company evidence, stop the pilot, retain audit IDs, and follow the security incident process.
