# ADAPTER_SPEC.md — Locomotive Dashboard Adapter (Portable API, Suggest-Only Safe)

**Version:** 1.0.0  
**Scope:** Locomotive “Lite Dashboard”-style read access, portable across projects  
**Primary goal:** The chatbot recommends **adapter calls** only (portable names). Each dashboard maps adapter calls to its own service functions.

---

## 1) What this file is (and why it exists)

`ADAPTER_SPEC.md` defines a **stable, project-agnostic interface** that any dashboard can implement so the chatbot widget works without knowing internal backend/service function names.

- The chatbot speaks **adapter language** (“getOutOfServiceCount”, “getNextDueInspection”).
- Each dashboard implements an adapter that translates those calls into the dashboard’s real service calls.
- A separate mapping doc (example: `docs/MAPPING_LITE_DASHBOARD.md`) documents how the adapter maps to a specific project’s service functions.

This is the “USB-C port” for dashboards: implement the port and the chatbot plugs in.

---

## 2) Safety model (non-negotiable)

### 2.1 Suggest-only
- The chatbot may **recommend** adapter calls.
- The chatbot must **never claim** it executed calls or changed data.

### 2.2 Read-only by default
- Only methods in **§6 Allowed / Recommendable** are safe for chatbot recommendations.
- Methods in **§7 Blocked (Side-effects)** are documented for completeness but are **NOT** recommendable.

### 2.3 Strict validation (deny-by-default)
Adapter runtime must reject:
- Unknown function names
- Extra/unknown arguments
- Missing required arguments
- Invalid argument types/formats

---

## 3) Date/time conventions

- All timestamps returned by the adapter must be **ISO 8601 strings** (`YYYY-MM-DDTHH:mm:ss.sssZ`) or `null`.
- If “today” is computed, the adapter should include `meta.timezone` to clarify the day boundary.

---

## 4) Standard result envelope (recommended)

To make UI + chatbot handling consistent across projects, every adapter call should return a standard envelope:

```ts
type AdapterErrorCode =
  | "INVALID_ARGUMENT"
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "DATA_UNAVAILABLE"
  | "STALE_DATA";

type AdapterError = {
  code: AdapterErrorCode;
  message: string;
  details?: any;
};

type AdapterMeta = {
  timezone?: string;               // e.g. "US/Eastern"
  lastCalculatedDate?: string|null; // ISO
  source?: string;                 // e.g. "LiteDashboardService"
};

type AdapterResult<T> =
  | { ok: true; value: T; meta?: AdapterMeta }
  | { ok: false; error: AdapterError; meta?: AdapterMeta };
````
---

## 5) Core domain types (normalized)

### 5.1 Locomotive references (how users refer to a loco)

Admins may say “4430”, “assetId 68ef…”, “MU 12”, “Unit ABC”. The adapter supports:

```ts
type LocomotiveRef =
  | { assetId: string }
  | { locoNo: string }
  | { name: string }
  | { muId: string };
```

**Matching rules**

* `assetId`: exact match only.
* `locoNo`: trimmed; prefer exact; may fallback to contains (implementation-defined).
* `name`: case-insensitive contains match allowed.
* `muId`: exact or case-insensitive contains (implementation-defined).

If multiple matches exist, return an **AMBIGUOUS** result (see §5.6).

---

### 5.2 Summary (dashboard KPIs)

```ts
type DashboardSummary = {
  noOfLocomotives: number | null;
  locomotivesOutOfService: number | null;
  nonCompliantLocomotives: number | null;
  compliantLocomotives: number | null;

  // optional KPIs
  locomotiveDailyInspections?: number | null;
  locomotivesDueForDailyInspec?: number | null;
};
```

---

### 5.3 Locomotive list item (safe for tables)

```ts
type LocomotiveSummaryItem = {
  assetId: string;
  locoNo: string | null;
  name: string | null;
  muId: string | null;

  outOfUse: boolean | null;
  nonCompliant: boolean | null;
  dailyDue: boolean | null;

  // optional dates if available
  outOfUseDate?: string | null;   // ISO
  dailyDueDate?: string | null;   // ISO
};
```

---

### 5.4 Inspection records

```ts
type InspectionRecord = {
  assetId: string;
  testCode: string | null;
  title: string | null;
  date?: string | null;           // ISO (for “last”)
  nextExpiryDate?: string | null; // ISO (for “due”)
};
```

---

### 5.5 Out-of-use credit

```ts
type OutOfUseCredit = {
  credit: number | null;
  outOfUseDays: number | null;
  status: string | null;
};
```

---

### 5.6 Ambiguity return type (for lookups)

When a `LocomotiveRef` is not `assetId`, it can match multiple locomotives.

```ts
type LocomotiveLookup =
  | { match: "single"; locomotive: LocomotiveSummaryItem }
  | { match: "multiple"; candidates: LocomotiveSummaryItem[] };
```

> Recommendation: treat “none” as `ok:false` with `NOT_FOUND`, not as `ok:true`.

---

## 6) Allowed / Recommendable (Read-only) adapter methods

These methods are safe for chatbot recommendations.

They provide:

1. **Full coverage of LiteDashboard read-only capabilities** using portable names, and
2. **Step-4 “portable UX” adapter methods** that make the chatbot usable across dashboards even when the underlying service is awkward.

---

### 6.1 `getDashboardSnapshot()`

**Purpose**

* “Show me the dashboard summary”
* “Give me the dashboard payload to drill down”

**Args**

* none

**Returns**

```ts
type DashboardSnapshot = {
  summary: DashboardSummary;
  // optional: include full locomotive data keyed by assetId (project-defined detail level)
  locomotives?: Record<string, LocomotiveSummaryItem>;
};
type Result = AdapterResult<DashboardSnapshot>;
```

**Notes**

* If your dashboard supports only summary, return `locomotives` omitted.
* Include `meta.lastCalculatedDate` if available.

**Example call**

```json
{ "function": "getDashboardSnapshot", "args": {} }
```

---

### 6.2 `listLocomotives(filters?)`  ✅ (portable UX method)

**Purpose**

* “List all locomotives”
* “Show out-of-use locomotives”
* “Show non-compliant locomotives”
* “Show locomotives due for daily inspection today”

**Args**

```ts
type Args = {
  // filters (optional)
  outOfUse?: boolean;
  nonCompliant?: boolean;
  dailyDueToday?: boolean;

  // pagination helpers (optional)
  limit?: number;
  offset?: number;
};
```

**Returns**

```ts
type Result = AdapterResult<LocomotiveSummaryItem[]>;
```

**Notes (implementation guidance)**

* This is intentionally a **stable UX API** for the chatbot.
* A project may implement this by:

  * calling `getDashboardSnapshot()` (or equivalent),
  * turning the locomotives map into a list,
  * then applying filters client-side/server-side.
* If `dailyDueToday` is computed using timezone/day bounds, include `meta.timezone`.

**Example calls**

```json
{ "function": "listLocomotives", "args": {} }
```

```json
{ "function": "listLocomotives", "args": { "outOfUse": true } }
```

```json
{ "function": "listLocomotives", "args": { "nonCompliant": true, "limit": 50 } }
```

```json
{ "function": "listLocomotives", "args": { "dailyDueToday": true } }
```

---

### 6.3 `getLocomotive(query)`  ✅ (portable UX method)

**Purpose**

* “Find locomotive 4430”
* “Get locomotive by assetId”
* “Find locomotive by name”
* “Find locomotive by MU id”

**Args**

```ts
type Args = { query: LocomotiveRef };
```

**Returns**

```ts
type Result = AdapterResult<LocomotiveLookup>;
```

**Ambiguity / edge cases**

* If the query matches exactly one unit:

  * return `ok:true` with `{ match:"single", locomotive: ... }`
* If the query matches multiple units:

  * return `ok:true` with `{ match:"multiple", candidates:[...] }`
  * The chatbot/UI should ask a follow-up like: “Which one do you mean?” using the candidate list.
* If nothing matches:

  * return `ok:false` with `error.code = "NOT_FOUND"`.

**Example calls**

```json
{ "function": "getLocomotive", "args": { "query": { "assetId": "68efffecb447af0013eb9fce" } } }
```

```json
{ "function": "getLocomotive", "args": { "query": { "locoNo": "4430" } } }
```

```json
{ "function": "getLocomotive", "args": { "query": { "name": "SD70" } } }
```

---

### 6.4 `listInspectionTestCodes()`

**Purpose**

* “What inspection test codes exist?”
* “Which inspection forms are supported?”

**Args**

* none

**Returns**

```ts
type Result = AdapterResult<string[]>;
```

**Example call**

```json
{ "function": "listInspectionTestCodes", "args": {} }
```

---

### 6.5 `getLocomotiveCount()`

**Purpose**

* “How many locomotives do we have?”

**Args**

* none

**Returns**

```ts
type Result = AdapterResult<number>;
```

**Example call**

```json
{ "function": "getLocomotiveCount", "args": {} }
```

---

### 6.6 `getOutOfServiceCount()`

**Purpose**

* “How many locomotives are out of service?”

**Args**

* none

**Returns**

```ts
type Result = AdapterResult<number>;
```

**Example call**

```json
{ "function": "getOutOfServiceCount", "args": {} }
```

---

### 6.7 `getNonCompliantCount()`

**Purpose**

* “How many locomotives are non-compliant?”

**Args**

* none

**Returns**

```ts
type Result = AdapterResult<number>;
```

**Example call**

```json
{ "function": "getNonCompliantCount", "args": {} }
```

---

### 6.8 `getInspectionsCompletedTodayCount()`

**Purpose**

* “How many inspections were completed today?”

**Args**

* none

**Returns**

```ts
type Result = AdapterResult<number>;
```

**Notes**

* If “today” depends on timezone, include `meta.timezone`.

**Example call**

```json
{ "function": "getInspectionsCompletedTodayCount", "args": {} }
```

---

### 6.9 `getDailyInspectionDueTodayCount()`

**Purpose**

* “How many locomotives are due for daily inspection today?”

**Args**

* none

**Returns**

```ts
type Result = AdapterResult<number>;
```

**Notes**

* If “today” depends on timezone, include `meta.timezone`.

**Example call**

```json
{ "function": "getDailyInspectionDueTodayCount", "args": {} }
```

---

### 6.10 `getLastInspectionByLocomotive()`

**Purpose**

* “Show the last inspection date for each locomotive”
* “Which locomotives were inspected most recently?”

**Args**

* none

**Returns**

```ts
type Result = AdapterResult<Record<string, InspectionRecord>>;
```

**Return semantics**

* Returned object is keyed by `assetId`.
* Each value includes `date` (ISO) for the last inspection when available.

**Example call**

```json
{ "function": "getLastInspectionByLocomotive", "args": {} }
```

---

### 6.11 `getNextDueInspectionByLocomotive()`

**Purpose**

* “Show the next due inspection per locomotive”
* “Which locomotives have upcoming inspections?”

**Args**

* none

**Returns**

```ts
type Result = AdapterResult<Record<string, InspectionRecord>>;
```

**Return semantics**

* Returned object is keyed by `assetId`.
* Each value includes `nextExpiryDate` (ISO) for the soonest due inspection when available.

**Example call**

```json
{ "function": "getNextDueInspectionByLocomotive", "args": {} }
```

---

### 6.12 `getNextDueInspection(assetId)`

**Purpose**

* “When is the next inspection due for this locomotive?”
* “What is the next due inspection test code/title/date?”

**Args**

```ts
type Args = { assetId: string };
```

**Returns**

```ts
type Result = AdapterResult<InspectionRecord | null>;
```

**Edge cases**

* If no due inspection exists, return `ok:true` with `value:null`.

**Example call**

```json
{ "function": "getNextDueInspection", "args": { "assetId": "<ASSET_ID>" } }
```

---

### 6.13 `getOutOfUseCredit(assetId)`

**Purpose**

* “What is the out-of-use credit for this locomotive?”
* “How many out-of-use days?”

**Args**

```ts
type Args = { assetId: string };
```

**Returns**

```ts
type Result = AdapterResult<OutOfUseCredit | null>;
```

**Edge cases**

* If credit is unavailable, return `ok:true` with `value:null` (preferred) or `ok:false DATA_UNAVAILABLE` (choose one approach and keep consistent).

**Example call**

```json
{ "function": "getOutOfUseCredit", "args": { "assetId": "<ASSET_ID>" } }
```

---

## 7) Blocked (Side-effects) — documented, NOT recommendable

These operations modify stored dashboard data or trigger recalculations.
They must be **blocked from chatbot recommendations** in safe mode.

### 7.1 `rebuildDashboardData()`

* **What it does:** rebuilds/recomputes dashboard dataset
* **Why blocked:** can cause heavy load + changes system state

### 7.2 `updateLocomotiveState(assetId | locoId, patch)`

* **What it does:** updates `assetStates` (outOfUse / nonCompliant / dailyDue etc.)
* **Why blocked:** write operation

### 7.3 `updateLocomotiveOutOfUseCredit(assetId | locoId)`

* **What it does:** recomputes + writes out-of-use credit into dashboard data
* **Why blocked:** write operation

### 7.4 `updateLocomotiveMUId(assetId | locoId, muId?)`

* **What it does:** writes MU id into dashboard data
* **Why blocked:** write operation

### 7.5 `updateLocomotiveInspection(date, unit, testInfo)`

* **What it does:** writes last inspection data + refreshes due inspection in dashboard data
* **Why blocked:** write operation

> If you ever decide to allow writes, you must implement explicit authentication/authorization, confirmation flows, and audit logging.
> Until then: “never recommend.”

---

## 8) Redaction defaults

By default, adapter responses must **exclude** personal contact info:

* Inspector email/signature
* Any personal phone/address fields

If the admin asks “who performed it?”, return only:

* inspector **name**
* optionally a non-sensitive internal id

---

## 9) Conformance checklist (definition of done)

A dashboard integration is adapter-compliant when:

* [ ] All methods in **§6** are implemented and read-only.
* [ ] Methods in **§7** exist only behind an internal/admin-only boundary and are not recommendable.
* [ ] All returned dates are ISO strings or `null`.
* [ ] Unknown functions / extra args / missing args are rejected.
* [ ] Sensitive fields are redacted by default.
* [ ] Adapter returns include `meta.lastCalculatedDate` when available.

---

## 10) Practical note: what the admin user sees

Admins should see plain-language answers and “next step” guidance.
Adapter call details are primarily for developers / debug mode.

Example:

* User: “When is the next inspection due for loco 4430?”
* Bot (UI): “We should fetch the next due inspection for that unit. Next step: resolve the locomotive, then fetch next due inspection.”
* Bot (recommendedCalls): `getNextDueInspection({ assetId: "..." })`
