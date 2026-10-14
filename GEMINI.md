# ASOC Dashboard Workspace Guidelines & UI/UX Invariants

## Typography & Hierarchy
- **KPI Titles vs Table Headers**: The title font size of all KPI widgets (`TOTAL DEVICES`, `TOP OS DISTRIBUTION`, `DEVICES AT RISK !`, `TOTAL VULNERABILITY`, `VULN DISTRIBUTION`, `VULN STATUS`, `TOTAL REPORTS`) must strictly match the table typography: `text-sm xl:text-base 2xl:text-lg font-extrabold text-gray-600 uppercase tracking-wider`.
- **Card Sub-labels**: Labels inside status/breakdown cards (e.g., `Critical`, `High`, `Medium` in *Devices At Risk*; `Solved`, `Not Patched` in *Vuln Status*) must match the font weight (`font-extrabold`) and uppercase tracking of their parent widget titles.

## Distribution Widgets & Truncation Guards
- **Top OS & Vuln Distribution**:
  - The count number in legend items must ALWAYS include `flex-shrink-0 font-black` to prevent truncation by long OS names or CVE descriptions.
  - The label text must include `truncate min-w-0`.
  - Item font size should remain compact: `text-xs sm:text-xs xl:text-sm`.

## Date & Time Invariants
- **No Raw ISO Timestamps**: Never render raw ISO timestamps (`YYYY-MM-DDTHH:mm:ss.sssZ`) directly in user-facing UI. Always pass dates through `formatStandardDate()` from `@/lib/date-utils` to produce clean `DD MMM YYYY HH:mm` format (e.g. `28 Sep 2026 09:15`).

## Filter Toolbar & Active Badges
- **Aesthetic**: Follow the soft light glassmorphism theme (`bg-white/90 backdrop-blur-md text-xs font-semibold px-2.5 py-1 rounded-lg border shadow-sm`). Avoid oversized text or heavy 2px colored borders on active filter tags.

## Authentication & Backend Performance Invariants
- **Master User Lookup**: MySQL queries against table `users` MUST utilize the B-Tree indexes (`idx_username` on virtual column `username` or `idx_name` on `name`). Never introduce unindexed full-table scans.
- **Schema Caching**: Database table schemas must remain cached in-memory with a TTL. Do NOT perform per-request `DESCRIBE` queries in hot authentication paths.
- **Argon2id Verification**: Argon2id password verification must prioritize non-blocking WebAssembly execution via `hash-wasm` to prevent event-loop starvation, with `@noble/hashes` as fallback.
- **OWASP-Balanced Dummy Hashing**: Dummy password verifications for constant-time mitigation must adhere to RFC 9106 / OWASP balanced settings (`m=19456, t=2, p=1`) to avoid CPU DoS on 2 vCPU servers.
- **Single Active Session**: Every login must bind the user ID to the new active session ID in Redis (`bindUserActiveSession`). Concurrent logins must be displaced and rejected.
- **Threadpool Sizing**: Keep `UV_THREADPOOL_SIZE=16` in container and system environments.
