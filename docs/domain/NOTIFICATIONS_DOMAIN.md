# Notifications Domain

## Business Goals

The notifications domain defines how the Novotech Partner Platform proactively informs partners and Novotech staff about important events.

Notifications should reduce manual follow-up, help partners react faster, and give Novotech managers visibility into workflows that need attention.

The main business goals are:

- Notify partners about relevant order, reservation, document, stock, price, and system events.
- Notify Novotech staff about partner actions, approval tasks, integration failures, and operational exceptions.
- Respect access profiles and partner status before including sensitive information.
- Avoid leaking hidden prices, hidden stock, finance data, or restricted documents.
- Support in-app notifications first, email where appropriate, and push notifications in the future.
- Keep notifications useful, actionable, and not noisy.

## Notification Types

### Order

Order notifications relate to order requests, direct orders, manager approval, 1C order creation, order status changes, rejection, or required partner action.

Sensitive order details should respect partner permissions.

### Reservation

Reservation notifications relate to reservation request, confirmation, rejection, partial reservation, expiration, or release.

Reservation notifications should not imply stock is guaranteed unless 1C confirmed the reservation.

### Price Change

Price change notifications inform authorized users that price information changed or requires review.

These notifications must respect price visibility permissions and should not expose hidden prices.

### Stock Arrival

Stock arrival notifications inform partners or managers when relevant products become available.

Stock depth in the notification must follow the partner company's stock visibility level.

### Manager Message

Manager messages are direct communications from Novotech managers to partner users or internal staff.

They may relate to order clarification, approval decisions, document requests, or operational notes.

### System Notification

System notifications cover platform events such as maintenance, 1C outage impact, failed sync, account status changes, or required action.

System notifications should be clear and operational, not technical noise for partners.

### Promotion

Promotion notifications inform eligible partners about campaigns, offers, or marketing opportunities.

Promotion visibility must follow access profile, partner eligibility, and commercial policy.

### Document Available

Document notifications inform users that a relevant document is available or updated.

The notification must not reveal restricted document titles, accounting data, or download links to unauthorized users.

## Delivery Channels

### In-App

In-app notifications are the primary channel for portal activity.

They should support read/unread state, priority, target audience, and links to allowed portal context.

### Email

Email notifications are useful for important partner and manager events.

Email content must be access-safe. Sensitive details should be minimized, with the portal used for authenticated viewing where needed.

### Push (Future)

Push notifications may be added later for urgent operational events.

Push notifications should be short, permission-safe, and configurable by user preference and business policy.

## Notification Lifecycle

### Created

A notification is created when a business event occurs and the recipient is eligible to know about it.

Eligibility must consider partner company, role, partner status, access profile, and notification preferences.

### Delivered

A notification is delivered through one or more enabled channels.

Delivery does not guarantee that the user has read it.

### Read

A user marks the notification as read, or the system marks it read according to a future approved behavior.

### Actioned

Some notifications require action, such as manager approval, partner confirmation, or retry after failure.

Action state should be tracked separately from read state where needed.

### Archived

Old notifications may be archived for history, audit, or cleanup.

Archive rules may differ for partner messages, manager tasks, and system events.

## Read / Unread

Read/unread state is user-specific.

Rules:

- One user reading a notification should not automatically mark it read for another user unless it is a shared manager task with explicit workflow behavior.
- Critical manager tasks may remain open even after read.
- Read state does not prove that a business action was completed.
- Unread counts should respect permissions and partner status.

## User Preferences

User preferences define how and when a user wants to receive notifications.

Preferences may include:

- Email enabled or disabled by type.
- In-app notification categories.
- Digest vs immediate delivery.
- Stock arrival interests.
- Document update subscriptions.
- Promotion opt-in where allowed.
- Manager task notifications.

Business-critical notifications may override user preferences when Novotech policy requires delivery.

## Priority

Notifications should have clear priority levels.

Possible priorities:

- Low: informational updates such as marketing material availability.
- Normal: routine order status or document updates.
- High: approval required, failed order creation, reservation issue, important price/stock change.
- Critical: security, suspension, major outage, or urgent operational failure.

Priority should affect ordering, attention style, and delivery channel decisions in future implementation.

## Access and Security Rules

Notifications must follow the same access rules as the underlying data.

Rules:

- Do not include hidden prices in notifications.
- Do not include exact stock when the partner only has availability-level access.
- Do not include accounting document details unless finance/document permissions allow it.
- Do not send partner-specific data to users from another partner company.
- Do not expose restricted documents through email links or previews.
- Recheck access when a user opens a notification target.
- Log sensitive notification creation and delivery where business policy requires it.

## Future Extensions

Possible future extensions include:

- Notification center.
- Email templates by notification type.
- Digest emails.
- Stock watchlists.
- Document subscriptions.
- Promotion targeting.
- Manager task queues.
- Escalation rules for unhandled manager tasks.
- Push notifications.
- Webhook notifications for strategic partners.
- Notification analytics.
- Partner-specific notification policies.
- Quiet hours and delivery windows.
- Multilingual notification content.

Future notification features must remain permission-aware and should never bypass access-control rules for convenience.
