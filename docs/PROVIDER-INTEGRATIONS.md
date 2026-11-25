# Provider integration contract

Public web pages are reference URLs, not verified API endpoints. Provider authorization has not been verified. Before enabling a job, configure the actual authorized endpoint, response mapping, allowed request rate, authentication method, and scope (read values, read listings, write listings, redistribution).

| Provider | Public reference pages | Intended feeds |
|---|---|---|
| AMVGG | https://amvgg.com/values/pets ; https://amvgg.com/trades | exact-variant values, normal/neon/mega demand stars, changes, listings |
| Elvebredd | https://elvebredd.com/adopt-me-calculator ; https://elvebredd.com/value-updates ; https://elvebredd.com/trade-center | exact-variant values, changes, listings; direct demand only if documented |
| AMTV | https://adoptmetradingvalues.com/pet-demand-list.php | active-offer demand ranks only (normal, neon, mega) |

Use a provider-approved service identity, HTTPS, backend secret storage, documented rate limits, conditional requests where supported, and backoff on 429/503. Stop on authorization errors. No session-cookie reuse, disguised clients, or access-control workarounds.

## Normalized feed
Market records: {source, petId, variant, value, unit, demand, observedAt}. AMTV records must have null value; combined values use only Elvebredd and AMVGG. Missing fields are null; variant is one of R0/RF/RR/RFR/N0/NF/NR/NFR/M0/MF/MR/MFR. Keep source-native star ratings and demand rank/window/denominator separately; do not invent potion-specific values if a feed only supplies growth forms.

Changes: {source, petId, variant, oldValue, newValue, unit, periodStart, periodEnd}. Preserve source-reported timeframe and do not fabricate daily history from summary changes.

Listings: {source,id,observedAt,expiresAt,offering,requesting}. See scout.mjs. Match exact variants and quantities. Treat unavailable or expired listings as inactive.

## Posting
Read and write permissions are independent. Only enable posting with a supported write endpoint and account authorization. Require genuine inventory-backed offers, explicit user opt-in, per-provider cooldowns, idempotency and a way to disable future reposts. Never report a listing as posted until the provider confirms it.

## Deployment status
No provider endpoint or credential has been configured. The existing spreadsheet remains a transitional data source. See authorized-feed.mjs and market.mjs for staged ingestion/validation primitives. This document does not activate any sync job.
