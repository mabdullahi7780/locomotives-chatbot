# DATA_DICTIONARY — Lite Dashboard Snapshot (`dashBoardDataJSON.js`)

This file documents the **actual shape** of the `dashboardData` object in `dashBoardDataJSON.js` (a Mongo/JS-style object, not strict JSON).

Conventions used in the source data:
- `ObjectId("...")` → MongoDB ObjectId (treat as a **string** in most app layers)
- `ISODate("...")` → Date/time value
- `NumberInt(n)` → Number (integer)

---

## Root object: `dashboardData`

### Shape

| Field | Type | Required? | Notes |
|------|------|-----------|------|
| `_id` | string (ObjectId) | yes | Mongo document id |
| `data` | `DashboardDataPayload` | yes | Computed dashboard payload |
| `inspection` | `null` | yes (in sample) | Always `null` in the sample file |
| `execution` | `null` | yes (in sample) | Always `null` in the sample file |
| `maintenance` | `null` | yes (in sample) | Always `null` in the sample file |
| `tag` | string | yes | Example: `"liteDashboardV1"` |
| `createdAt` | Date | yes | `ISODate(...)` |
| `updatedAt` | Date | yes | `ISODate(...)` |
| `__v` | number (int) | yes | Mongo version key |

### Meaning
A single saved dashboard snapshot (identified by `tag`), containing locomotive dashboard data under `data`.

---

## `data`: `DashboardDataPayload`

### Shape

| Field | Type | Required? | Notes |
|------|------|-----------|------|
| `lastCalculatedDate` | string | yes | In sample: `"YYYY-MM-DD"` |
| `locomotives` | `Record<string, Locomotive>` | yes | Dictionary keyed by `assetId` |

### Meaning
The top-level payload the dashboard/UI consumes: “when it was calculated” + “all locomotives by id”.

---

## `data.locomotives`: `Record<string, Locomotive>`

### Shape
- **Key**: `assetId` (string; looks like a Mongo ObjectId string)
- **Value**: `Locomotive`

---

## `Locomotive`

### Shape

| Field | Type | Required? | Notes |
|------|------|-----------|------|
| `id` | string | yes | Same as the locomotives dictionary key |
| `name` | string | yes | Human label (often includes model) |
| `muId` | string \| null | yes | `null` in the sample file, but model as nullable |
| `locoNo` | string | yes | **May include trailing spaces** (must trim when matching) |
| `assetStates` | `AssetStates` | yes | Operational flags and dates |
| `outOfUseCredit` | `OutOfUseCredit` | yes | Credit / out-of-use days summary |
| `LastInspec` | `LastInspection` \| `{}` | yes | Either populated object OR empty object |
| `DueInspec` | `DueInspection` \| `{}` | yes | Either populated object OR empty object |

---

## `assetStates`: `AssetStates`

### Shape

| Field | Type | Required? | Notes |
|------|------|-----------|------|
| `outOfUse` | boolean | yes | Out of service flag |
| `nonCompliant` | boolean | yes | Compliance flag |
| `engineHour` | number (int) | yes | `NumberInt(...)` in source |
| `autoBlueCardInitialize` | boolean | yes | Present for all in sample |
| `dailyDue` | Date | no | Present on some locomotives only |
| `outOfUseDate` | Date | no | Present on some locomotives only |

### Meaning (admin-language)
- `outOfUse`: whether the unit is currently out of use/out of service.
- `nonCompliant`: whether the unit is flagged non-compliant.
- `dailyDue`: timestamp associated with daily due-ness (field is optional).
- `outOfUseDate`: when the unit went out of use (field is optional).

---

## `outOfUseCredit`: `OutOfUseCredit`

### Shape

| Field | Type | Required? | Notes |
|------|------|-----------|------|
| `credit` | number (int) | yes | `NumberInt(...)` in source |
| `outOfUseDays` | number (int) | yes | `NumberInt(...)` in source |
| `status` | string | yes | Observed values: `""`, `"Available"` |

### Meaning (admin-language)
Summarizes out-of-use credit availability and the number of out-of-use days.

---

## `LastInspec`: `LastInspection` (or `{}`)

### Important behavior
`LastInspec` can be an **empty object** `{}` meaning “no last inspection info available in this snapshot”.

### Shape (when populated)

| Field | Type | Required? | Notes |
|------|------|-----------|------|
| `date` | Date | yes | `ISODate(...)` |
| `title` | string | yes | Example: `"92-Day Periodic Inspection"` |
| `testCode` | string | yes | Example: `"periodic92Days"` |
| `user` | `InspectionUser` | yes | Inspector metadata |
| `assetId` | string | yes | Asset id string |

---

## `LastInspec.user`: `InspectionUser`

### Shape

| Field | Type | Required? | Notes |
|------|------|-----------|------|
| `id` | string | yes | User id string |
| `name` | string | yes | Inspector name |
| `email` | string | yes | Inspector email |
| `signature` | `UserSignature` | no | Present only for some users |

---

## `LastInspec.user.signature`: `UserSignature` (optional)

### Shape

| Field | Type | Required? | Notes |
|------|------|-----------|------|
| `md5` | string | yes | Hash string |
| `status` | number (int) | yes | `NumberInt(...)` in source |
| `imgName` | string | yes | Signature image filename |

---

## `DueInspec`: `DueInspection` (or `{}`)

### Important behavior
`DueInspec` can be an **empty object** `{}` meaning “no due inspection info available in this snapshot”.

### Shape (when populated)

| Field | Type | Required? | Notes |
|------|------|-----------|------|
| `testCode` | string | yes | Example: `"periodic92Days"` |
| `assetId` | string | yes | Asset id string |
| `title` | string | yes | Due inspection name |
| `nextExpiryDate` | Date | yes | `ISODate(...)` |

---

# Question-critical fields (for chatbot reliability)

This section lists the **~10 most important “human question → JSON path(s)”** mappings.
Goal: reduce wrong-field answers and handle missing data (`{}` / optional fields) consistently.

## Intent 1: Identify a locomotive (by number/name/id)

**User phrasings**
- “Show 4430”, “loco 4430”, “4430 SD70M”, “asset 68efff...”

**Primary fields**
- `Locomotive.id`
- `Locomotive.locoNo` (TRIM whitespace)
- `Locomotive.name`

**Rules**
- Always trim both user input and `locoNo` for matching.
- Prefer exact `id` match if the user provides a long hex-like string.

---

## Intent 2: Next inspection due / upcoming expiry

**User phrasings**
- “When is the next inspection due?”
- “What’s expiring next?”
- “Next periodic due date?”

**Primary fields**
- `Locomotive.DueInspec.nextExpiryDate`
- `Locomotive.DueInspec.title`
- `Locomotive.DueInspec.testCode`

**Fallback / missing-data behavior**
- If `DueInspec` is `{}`, respond: “No due inspection info in this snapshot.”

**Disambiguation rule**
- If the user says “inspection / periodic / test / expiry”, interpret as `DueInspec` (not daily due).

---

## Intent 3: Last inspection date / last test done

**User phrasings**
- “When was it last inspected?”
- “Last periodic?”
- “Last test?”

**Primary fields**
- `Locomotive.LastInspec.date`
- `Locomotive.LastInspec.title`
- `Locomotive.LastInspec.testCode`

**Fallback / missing-data behavior**
- If `LastInspec` is `{}`, respond: “No last inspection info in this snapshot.”

---

## Intent 4: Who performed the last inspection?

**User phrasings**
- “Who did the last inspection?”
- “Which inspector signed off?”

**Primary fields**
- `Locomotive.LastInspec.user.name`
- `Locomotive.LastInspec.user.email`

**Fallback**
- If `LastInspec` is `{}`, there is no user info.
- If `user.signature` is missing, don’t treat it as an error.

---

## Intent 5: Out of use status (is it out of service?)

**User phrasings**
- “Is 4430 out of use?”
- “Which units are out of service?”

**Primary fields**
- `Locomotive.assetStates.outOfUse`

**Optional supporting fields**
- `Locomotive.assetStates.outOfUseDate` (if present)

---

## Intent 6: How long out of use / out-of-use credit

**User phrasings**
- “How long has it been out?”
- “How many out-of-use days?”
- “What’s the out-of-use credit?”

**Primary fields**
- `Locomotive.outOfUseCredit.outOfUseDays`
- `Locomotive.outOfUseCredit.credit`
- `Locomotive.outOfUseCredit.status`

**Notes**
- Even if `assetStates.outOfUse` is false, credit fields may still exist (don’t assume otherwise).

---

## Intent 7: Compliance / non-compliance

**User phrasings**
- “Is it compliant?”
- “Show non-compliant locomotives.”

**Primary fields**
- `Locomotive.assetStates.nonCompliant`

**Interpretation rule**
- “Compliant” = `nonCompliant === false`

---

## Intent 8: Daily due (daily inspection due)

**User phrasings**
- “Which units are daily due?”
- “Is it due today for daily?”

**Primary fields**
- `Locomotive.assetStates.dailyDue` (optional)

**Fallback**
- If `dailyDue` is missing, respond: “Daily due not present for this unit in the snapshot.”

**Disambiguation rule**
- If the user says “daily” explicitly, interpret as `dailyDue`.
- If they only say “due” with no other context, treat as ambiguous between `dailyDue` and `DueInspec`:
  - If only one is available, use the available one.
  - If both are available/plausible, set `needs_followup` later (in chatbot logic).

---

## Intent 9: Engine hours

**User phrasings**
- “Engine hours for 4430?”
- “How many hours on it?”

**Primary fields**
- `Locomotive.assetStates.engineHour`

---

## Intent 10: “Blue card / initialize / setup” style operational flag

**User phrasings**
- “Is blue card initialized?”
- “Auto initialize status?”

**Primary fields**
- `Locomotive.assetStates.autoBlueCardInitialize`

---

## Reliability rules (global)

1. **Never assume populated inspection objects**
   - `LastInspec` / `DueInspec` can be `{}`.
2. **Treat missing optional fields as normal**
   - `dailyDue`, `outOfUseDate`, `user.signature` may not exist.
3. **Normalize locomotive number matching**
   - Trim `locoNo` (source contains trailing spaces).
4. **Prefer stable identifiers when present**
   - If input looks like an asset id, match against `Locomotive.id` first.
