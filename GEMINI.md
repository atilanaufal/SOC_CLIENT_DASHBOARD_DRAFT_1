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
