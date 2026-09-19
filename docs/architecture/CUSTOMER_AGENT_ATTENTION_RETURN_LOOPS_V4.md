# Customer and Agent Attention Return Loops V4

## Scope and ownership

Attention is a bounded presentation of existing domain truth. It is not a notification center and does not own Order, Payment, Refund, Service, Referral, or Attribution state. `read_at` records only that a user opened or acknowledged a presentation item.

## Source audit

| Source | User value | Actionable | Existing projection | Delivery / surface | Gap |
|---|---|---:|---:|---|---|
| `customer_service_requests.status = NEED_INFO` | Customer reply required | Yes | Current-state read | Customer Home + Service detail | None |
| `customer_service_notifications` reply/resolved events | New Novotech result | No, important update | Yes, reused | Customer Home + Service history | None |
| `retail_payment_events` activation/reconciliation completed | Paid order confirmed | No, important update | Read directly from append-only fact | Customer Home | No outbound delivery added |
| `retail_payment_attempts.status = failed` | Payment did not complete | No, important update | Current terminal attempt state | Customer Home | No outbound delivery added |
| `retail_payment_refund_events.refund_confirmed` | Refund completed | No, important update | Read directly from append-only fact | Customer Home | No outbound delivery added |
| Product document tables | Documents currently available | No creation event | No | Existing Documents workspace | No truthful document-created notification is possible yet |
| `customer_account_events` | Account lifecycle/audit | Usually no | No | Not shown | Technical/profile events intentionally excluded |
| `agent_domain_events` referral/attribution events | Meaningful operational change | No current Agent mutation, important update | Reused directly | Agent Home Attention, then Activity after read | None |
| `agent_referrals` / `agent_attributions` | Current operational records | Depends on domain | Existing bounded lists/details | Referral/Client workspaces | No clarification action exists, so status results are not labelled action-required |
| Agent onboarding/compliance state | Next governed step | Yes when Agent can act | Existing `StatusGate` readiness projection | Agent onboarding Home | None |
| Attribution protection window | Current validity | No Agent action exists | Existing detail | Client detail | No urgency/countdown manufactured |

## Priority and lifecycle

| Attention type | Created when | Visible while | Resolved when | Read effect | Deep link |
|---|---|---|---|---|---|
| Service `NEED_INFO` | Request enters `NEED_INFO` | Domain status remains `NEED_INFO` | Customer reply/domain transition changes status | None; reading cannot resolve it | Service request |
| Service reply | Governed customer-visible Novotech reply creates existing notification | Notification unread | User marks/opens it | Sets notification `read_at` only | Service request |
| Service resolved | Governed transition creates existing notification | Notification unread | User marks/opens it | Sets notification `read_at` only | Service request |
| Payment paid | Authoritative activation/reconciliation completion exists and order is confirmed/paid | Presentation receipt absent | User opens it | Inserts payment read receipt only | Retail order |
| Payment failed | Authoritative PaymentAttempt is terminal `failed` | Presentation receipt absent | User opens it | Inserts failed-payment read receipt only | Retail order |
| Payment refunded | Authoritative `refund_confirmed` fact and refunded state exist | Presentation receipt absent | User opens it | Inserts refund read receipt only | Retail order |
| Agent referral/attribution update | Append-only meaningful `agent_domain_events` row exists | Agent event receipt absent | User opens it | Inserts Agent event read receipt only | Referral or attributed client |

Priority is semantic: `ACTION_REQUIRED` first, then `IMPORTANT_UPDATE`, then `INFORMATIONAL`; newest event wins within a priority. Home reads at most three attention rows. No historical event count is presented as a badge.

## Projection and deduplication

- Customer Home remains one bounded overview RPC. Existing service notification rows are reused, not copied.
- Paid attention has one semantic identity per Retail Order; callback and reconciliation evidence cannot create duplicate paid Home items.
- Refund attention has one semantic identity per governed refund.
- Agent Home reads one bounded overview RPC. Events currently visible in Attention are excluded from Activity; after read they can appear in chronological Activity.
- Referral list remains the current-state work list and does not become an event feed.

## Boundaries

- In-app only: no email, SMS, cron, polling, or background fanout.
- No MAIB behavior/configuration change.
- Marketplace remains off and Ranking is untouched.
- No Agent commission balance, earning, or payout claim.
- No production fixtures.
- No navigation badge is added: it would require a second global-layout read and offers no value over the top-of-Home bounded projection.
