# Trade acceptance capability and safety
Current status: automatic acceptance is disabled. Both providers offer acceptance in their user interface, but no authorized third-party acceptance API has been verified. Do not infer permission from an internal network request, reuse login cookies, or bypass restrictions.

A supported integration would need a documented acceptance operation, user-scoped authorization, provider rate limits, revocation and a way to reconcile the final listing status. A listing acceptance is not a completed Roblox pet exchange.

## Before enabling a provider
- Verify provider-approved read and write access and keep authorization server-side.
- Explicit opt-in with minimum profit >= 5%, demand loss <= 1/10, and user-defined daily budget; default alerts only.
- Verify current listing status and exact offered/requested variants immediately before acceptance. Recompute using current, verified, comparable valuations and demand data.
- Atomically reserve owned, unlocked, unreserved inventory and claim a unique (user, provider, listing) action record. Stop if any item is unavailable.
- Respect provider limits and user caps; stop on auth errors, rate limits or uncertain outcomes. Never blindly retry a write.
- Require provider confirmation before recording accepted status. Do not subtract inventory until the user verifies actual in-game completion. Reconcile failures, cancellations and expired reservations.
- Provide a kill switch and audit history. Test with a sandbox and unrelated accounts before enabling.

Until this is verified, show a qualifying trade and open the official provider site for manual acceptance. Notification timing is bounded by listing refresh cadence (target five minutes where allowed), not guaranteed instantaneous upstream discovery.
