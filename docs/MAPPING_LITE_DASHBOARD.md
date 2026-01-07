# MAPPING_LITE_DASHBOARD.md — Adapter → LiteDashboardService mapping

This document explains how each **portable adapter method** (from `docs/ADAPTER_SPEC.md`) is implemented using the **project-specific** `LiteDashboardService` methods.

The chatbot will recommend **adapter methods only**. Your app (or an adapter layer) is responsible for translating adapter calls into `LiteDashboardService` calls.

---

## 0) Key facts about LiteDashboardService behavior

### Timezone / “today”
LiteDashboardService computes “today” using:
- `timezone = "US/Eastern"`
- `startOfDay` and `endOfDay` using `moment-timezone` in the constructor.  
This affects daily due logic and “inspections completed today” queries.

### Stored dashboard payload
`getDashBoardData()` returns:
- `value.summary` (computed KPI summary)
- `value.assetData` (map of locomotives stored in `ReportModel.data.locomotives`).  
This is the best source for list/lookup adapter UX methods.

The stored per-loco object shape (built by `dashBoardDataBuildUp`) contains fields like:
`id`, `name`, `muId`, `locoNo`, `assetStates`, `outOfUseCredit`, `LastInspec`, `DueInspec`.

---

## 1) Adapter → LiteDashboard mappings (Allowed / Recommendable)

> ✅ These mappings are safe for the advisor chatbot to recommend in “safe mode”.

### Mapping table

| Adapter method | LiteDashboardService call(s) | Args mapping | Result mapping / normalization |
|---|---|---|---|
| `getDashboardSnapshot()` | `getDashBoardData()` | `{}` → `{}` | Use `value.summary` as `summary`. Use `value.assetData` as the `locomotives` map (convert each item to `LocomotiveSummaryItem` if you want strict normalized output). Include `meta.timezone = "US/Eastern"`. |
| `listLocomotives(filters?)` | `getDashBoardData()` (preferred) | `filters` used in adapter layer only | Build list from `value.assetData` keys/values. Apply filters: `outOfUse` → `assetStates.outOfUse`, `nonCompliant` → `assetStates.nonCompliant`, `dailyDueToday` → compare `assetStates.dailyDue` to `startOfDay/endOfDay` logic (same logic as Lite’s daily due count). Then paginate by `offset/limit`. |
| `getLocomotive(query)` | `getDashBoardData()` (preferred) | `query` used in adapter layer only | Look up within `value.assetData` by: `assetId` = key or `item.id`. `locoNo` matches `item.locoNo`. `name` matches `item.name`. `muId` matches `item.muId`. Return `AMBIGUOUS` if multiple candidates. |
| `listInspectionTestCodes()` | `getAllTestCodes()` | `{}` | Return the array as-is. |
| `getLocomotiveCount()` | `getAllLocomotivesCount()` | `{}` | Return number as-is. |
| `getOutOfServiceCount()` | `getAllOutOfServiceLocomotivesCount()` | `{}` | Return number as-is. |
| `getNonCompliantCount()` | `getAllNonCompliantLocomotives()` | `{}` | Return number as-is (note: method name says “getAllNonCompliantLocomotives” but returns a count). |
| `getInspectionsCompletedTodayCount()` | `getAllInspectionsCompletedTodayCount()` | `{}` | Return number as-is. Include `meta.timezone` since “today” is timezone-bounded in Lite. |
| `getDailyInspectionDueTodayCount()` | `getAllDailyInspectionLocomotivesCount()` | `{}` | Return number as-is. Include `meta.timezone`. |
| `getLastInspectionByLocomotive()` | `getAllLocomotiveLastInspectionDate()` | `{}` | Returns an object keyed by `assetId`. For each record, keep `{ assetId, date, title, testCode }`. Drop/redact `user`. Convert dates to ISO strings. |
| `getNextDueInspectionByLocomotive()` | `getAllLocomotiveDueInspectionDate()` | `{}` | Returns an object keyed by `assetId`. For each record, keep `{ assetId, nextExpiryDate, title, testCode }`. Convert `nextExpiryDate` to ISO strings if needed. |
| `getNextDueInspection(assetId)` | `getLocoNextDueLocoInspection(assetId)` | `assetId` passthrough | Lite returns `{}` if not found. Adapter should convert `{}` → `null`. Preserve `assetId/title/testCode/nextExpiryDate`. |
| `getOutOfUseCredit(assetId)` | `getLocoOutOfUseCredit(assetId)` | `assetId` passthrough | Return `{ credit, outOfUseDays, status }` as-is (already normalized). |

---

## 2) Detailed implementation notes for the “portable UX” methods

These are adapter-level conveniences (not 1:1 Lite methods). They make the chatbot portable and user-friendly.

### 2.1 `listLocomotives(filters?)` (implemented via `getDashBoardData()`)

**Source**
- Call `getDashBoardData()` and read `value.assetData`.

**Normalization (recommended)**
For each locomotive item `l` in `assetData`:
- `assetId`: use the map key OR `l.id`
- `locoNo`: `l.locoNo ?? null`
- `name`: `l.name ?? null`
- `muId`: `l.muId ?? null`
- `outOfUse`: `Boolean(l.assetStates?.outOfUse)` (or `null` if missing)
- `nonCompliant`: `Boolean(l.assetStates?.nonCompliant)` (or `null`)
- `dailyDueDate`: `l.assetStates?.dailyDue ?? null` (ISO string or null)
- `dailyDue`: `dailyDueDate != null` (boolean) — **or** compute “due today” as below
- Optional: `outOfUseDate` if your `assetStates` contains one

**Filter logic**
- `outOfUse === true` → keep only `assetStates.outOfUse === true`
- `nonCompliant === true` → keep only `assetStates.nonCompliant === true`
- `dailyDueToday === true` → keep only those where `assetStates.dailyDue` lies between Lite’s `startOfDay` and `endOfDay` (same logic used by `getAllDailyInspectionLocomotivesCount()`)

**Pagination**
- Apply `offset` then `limit`.

---

### 2.2 `getLocomotive(query)` (implemented via `getDashBoardData()`)

**Source**
- Call `getDashBoardData()` and search inside `value.assetData`.

**Match rules**
- If `{ assetId }`: exact match by key or by `item.id`
- If `{ locoNo }`: trimmed exact match first; if none, optional contains match
- If `{ name }`: case-insensitive contains match
- If `{ muId }`: exact or contains match against `item.muId`

**Return**
- If exactly 1 match → `{ match: "single", locomotive }`
- If >1 matches → `{ match: "multiple", candidates: [...] }` (and chatbot asks follow-up)
- If 0 matches → `ok:false` with `NOT_FOUND`

---

## 3) Blocked adapter methods → LiteDashboard write methods (NOT recommendable)

> ❌ These are **side-effect** operations. Keep them blocked from normal chatbot output.

| Adapter “blocked” method | LiteDashboardService method | Notes |
|---|---|---|
| `rebuildDashboardData()` | `dashBoardDataBuildUp()` | Rebuilds and **writes** `ReportModel.data.locomotives` + `lastCalculatedDate`. |
| `updateLocomotiveState(assetId\|locoId, patch)` | `updateDashBoardLocoState(locoId)` | Lite method recomputes state from AssetsService and writes `assetStates`. No “patch” argument in Lite; adapter would ignore patch or forbid it. |
| `updateLocomotiveOutOfUseCredit(assetId\|locoId)` | `updateLocoOutOfUseCredit(locoId)` | Recomputes and writes `outOfUseCredit`. |
| `updateLocomotiveMUId(assetId\|locoId, muId?)` | `updateDashBoardLocoMUId(locoId)` | Computes MU head loco number via internal helper and writes `muId`. |
| `updateLocomotiveInspection(date, unit, testInfo)` | `updateDashBoardLocoInspection(date, unit, testInfo)` | Writes `LastInspec` and refreshes `DueInspec`. |
| `listInspectableAssetsRaw()` *(optional)* | `getAllLocomotives()` | `{}` | Return the assets array as-is. Use when you only need the upstream asset inventory (not dashboard fields). |


**Internal helper (not user-facing)**
- Lite has `getLocoMUId(locoId, locos)` as an internal helper used by the MU update flow.

---

## 4) Quick validation checklist (recommended)

- Adapter should always include `meta.timezone = "US/Eastern"` for “today”-based results.
- Convert all Date objects to ISO strings before returning to UI/chatbot.
- For `getNextDueInspection(assetId)`: convert `{}` → `null` to match adapter spec.
- For `getLastInspectionByLocomotive()`: drop/redact `user` (PII) by default.
- For portable UX methods: use `getDashBoardData().value.assetData` as the canonical lookup/list source.

---
