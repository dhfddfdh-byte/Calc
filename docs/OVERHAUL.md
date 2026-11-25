# Calc v2 — staged overhaul (not deployed)

## Data sources and permissions
- AMVGG: https://amvgg.com/values/pets — values and 3-star demand for normal, neon, mega. Automated ingestion disabled until permission/authorized feed is verified.
- Elvebredd: https://elvebredd.com/adopt-me-calculator and https://elvebredd.com/value-updates — verify value units, feed access, and demand availability.
- AMTV: https://adoptmetradingvalues.com/pet-demand-list.php — demand rankings only, subject to verified permission. No AMTV values, value trends or exotic classifications. Combined values use Elvebredd and AMVGG only.
- Existing owner-provided spreadsheet: preserve as migration input; verify malformed headers and timestamp semantics. Never publish private account data or restricted third-party data to this public repository.
- Scheduled sync should fetch once centrally, validate schema and coverage, preserve last-known-good data, store source timestamps separately, and append change events. Schedule only after permissions and feed formats are confirmed.
- Missing values stay null; no implicit variant/source substitution. Source and value unit must be explicit.
- Combined mode uses verified matched variant anchors; median is a heuristic, not a market truth. Demand ranks and stars are different signals and need calibration before treating scores as comparable.

## Staged code
- src/v2/market.mjs: pure market functions and bounded approximate inventory search; not wired into legacy UI.
- src/v2/optimizer.worker.mjs: message-based worker entry point; UI must cancel superseded jobs and enforce a workload budget.
- tests/market.test.mjs: regression cases; run node --test tests/market.test.mjs.
- supabase/migrations/001_account_state.sql: draft owner-only state storage with optimistic revisions. Not applied. Auth provider setup, email confirmation, recovery and OAuth redirects remain required.
- Do not put a service role key or passwords in client files. Use the provider's public client key only. Test with two unrelated users and unauthenticated requests.

## Remaining implementation
1. Import legacy data and history without treating zeros as verified values; verify source units, ambiguous names, and dates.
2. Authorized source adapters; coverage/staleness diagnostics, updates tab, source-specific history, demand calibration.
3. Modular UI and virtualized lists, image cache, lazy charts, mobile profiling, cancellable worker requests.
4. Unified verdict and recommendation engine; use real accepted/rejected outcomes before any probability claims.
5. Account frontend, migration/export, private inventory profiles, explicit transfer consent, expiry, replay protection and audit records.
6. Browser and database integration tests. Never merge until verified.
