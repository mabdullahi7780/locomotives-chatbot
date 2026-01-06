# FUNCTION_CATALOG.md — LiteDashboardService (Advisor-only Chatbot)

This document is the **human-readable version** of `docs/FUNCTION_CATALOG.json`.  
It exists so developers (and reviewers) can clearly see **exactly what the chatbot is allowed to recommend**, what each function does, what inputs it needs, what outputs matter, and what is **blocked** to prevent side effects and hallucinations. :contentReference[oaicite:0]{index=0}

---

## Why this catalog exists (significance)

### 1) It prevents hallucinated APIs
The chatbot must only ever output function calls that appear in this catalog. Anything else is invalid and should be rejected by runtime validation. :contentReference[oaicite:1]{index=1}

### 2) It enforces “advisor-only” behavior
The chatbot **recommends** calls; it never executes them.  
This catalog draws a hard line between:

- ✅ **Allowed / Recommendable (Read-only)** functions (safe to suggest)
- ❌ **Blocked (Side-effects)** functions (write operations) :contentReference[oaicite:2]{index=2}

### 3) It makes answers deterministic
Each function includes:
- **returnSemantics**: what each important return field *means*
- **successCriteria**: how you know the call “worked”
- **edgeCases**: what empty/null results mean (and what to tell the user)
- **presentation**: how the UI should format the result :contentReference[oaicite:3]{index=3}

---

## Policy summary (how the bot must behave)

### Safe Mode (default)
In safe mode, the chatbot may recommend only functions that are:
- `recommendable: true`
- `readOnly: true` :contentReference[oaicite:4]{index=4}

### Deny-by-default guardrails
- Deny unknown functions
- Deny missing required args
- Deny extra args not in schema
- Validate output shape: `{ function, args }` :contentReference[oaicite:5]{index=5}

---

## Vocabulary / fields used in the JSON

### `recommendable`
Whether the chatbot is allowed to suggest this function.

### `readOnly`
Whether the function has side effects (writes to DB / updates state).  
Read-only functions are safe to recommend. Write functions are blocked in safe mode. :contentReference[oaicite:6]{index=6}

### `argsSchema`
A strict schema for allowed arguments. Used to reject hallucinated parameters.

### `readTheseFields`
The key fields the UI / app should read after executing the function.

### `returnSemantics`
A dictionary explaining what return fields mean (labels + meaning + types).

### `successCriteria`
Machine-checkable rules to decide whether the call succeeded.

### `edgeCases`
Explicit meanings of empty objects, null dates, missing records, zero counts, etc.

### `presentation`
How the UI should display the result (KPI, table, card, etc.). :contentReference[oaicite:7]{index=7}

---

# ✅ Allowed / Recommendable Functions (Read-only)

These functions are safe for the advisor bot to recommend in normal operation.

---

## 1) `getDashBoardData` — Get dashboard summary and asset data

**What it’s for (admin intents it answers)**
- “Show me dashboard summary”
- “How many locomotives are compliant/non-compliant/out-of-service?”
- “Give me the full dashboard payload so I can drill down per locomotive” :contentReference[oaicite:8]{index=8}

**Params**
- None

**Returns (key meaning)**
- `status`: HTTP-like status code. `200` means success.
- `value.summary.*`: high-level dashboard KPIs:
  - `noOfLocomotives`
  - `locomotiveDailyInspections`
  - `locomotivesDueForDailyInspec`
  - `locomotivesOutOfService`
  - `nonCompliantLocomotives`
  - `compliantLocomotives`
- `value.assetData`: map keyed by `assetId` with per-locomotive dashboard data :contentReference[oaicite:9]{index=9}

**Success criteria**
- `status == 200`
- `value`, `value.summary`, `value.assetData` are objects :contentReference[oaicite:10]{index=10}

**Edge cases**
- `status != 200`: treat as error; do not interpret `value.*`
- `value.assetData` empty: dashboard exists but contains no locomotive entries
- missing summary fields: partial payload; show only what exists :contentReference[oaicite:11]{index=11}

**Key fields to read**
- `value.summary.noOfLocomotives`
- `value.summary.locomotiveDailyInspections`
- `value.summary.locomotivesDueForDailyInspec`
- `value.summary.locomotivesOutOfService`
- `value.summary.nonCompliantLocomotives`
- `value.summary.compliantLocomotives`
- `value.assetData` :contentReference[oaicite:12]{index=12}

**Example call**
```json
{ "function": "getDashBoardData", "args": {} }
```

---

## 2) `getAllLocomotives` — List all locomotives

**What it's for (admin intents it answers)**
- "List all locomotives"
- "Show fleet list / inventory"
- "Help me find an `assetId` I can use for other queries"

**Params**
- None

**Returns (key meaning)**
- An array of asset objects (fields depend on the upstream asset service)
- Useful keys (when available):
  - `[]..*_id` (asset identifier)
  - `[]..attributes` (metadata)

**Success criteria**
- result is an array

**Edge cases**
- empty array: no locomotives returned (none exist or upstream returned none)

**Key fields to read**
- `[].*_id`
- `[].attributes`

**Example call**
```json
{ "function": "getAllLocomotives", "args": {} }
```

---

## 3) `getAllTestCodes` — List all test codes

**What it's for (admin intents it answers)**
- "What inspection test codes exist?"
- "Show available tests / inspection codes"

**Params**
- None

**Returns**
- `string[]` of enabled test codes

**Success criteria**
- result is an array
- items are strings

**Edge cases**
- empty array: no enabled test codes found

**Key fields to read**
- the array items themselves

**Example call**
```json
{ "function": "getAllTestCodes", "args": {} }
```

---

## 4) `getAllLocomotivesCount` — Count all locomotives

**What it's for (admin intents it answers)**
- "How many locomotives do we have?"

**Params**
- None

**Returns**
- `number` (total locomotives)

**Success criteria**
- result is a number ≥ 0

**Edge cases**
- result `0`: no locomotives present in dataset

**Key fields to read**
- return value itself

**Example call**
```json
{ "function": "getAllLocomotivesCount", "args": {} }
```

---

## 5) `getAllOutOfServiceLocomotivesCount` — Count out-of-service locomotives

**What it's for (admin intents it answers)**
- "How many locomotives are out of service?"

**Params**
- None

**Returns**
- `number`

**Success criteria**
- result is a number ≥ 0

**Edge cases**
- `0`: none are marked out of service

**Example call**
```json
{ "function": "getAllOutOfServiceLocomotivesCount", "args": {} }
```

---

## 6) `getAllNonCompliantLocomotives` — Count non-compliant locomotives

**What it's for (admin intents it answers)**
- "How many locomotives are non-compliant?"

**Params**
- None

**Returns**
- `number`
- Note: despite the name, this is a count (not a list).

**Success criteria**
- result is a number ≥ 0

**Edge cases**
- `0`: none are flagged non-compliant

**Example call**
```json
{ "function": "getAllNonCompliantLocomotives", "args": {} }
```

---

## 7) `getAllInspectionsCompletedTodayCount` — Count inspections completed today

**What it's for (admin intents it answers)**
- "How many inspections were completed today?"

**Params**
- None

**Returns**
- `number`
- Note: "today" is computed using the service's timezone bounds (US/Eastern).

**Success criteria**
- result is a number ≥ 0

**Edge cases**
- `0`: no inspections counted as completed today

**Example call**
```json
{ "function": "getAllInspectionsCompletedTodayCount", "args": {} }
```

---

## 8) `getAllDailyInspectionLocomotivesCount` — Count locomotives due for daily inspection today

**What it's for (admin intents it answers)**
- "How many locomotives are due for daily inspection today?"

**Params**
- None

**Returns**
- `number` (count due today using service day bounds)

**Success criteria**
- result is a number ≥ 0

**Edge cases**
- `0`: none are due today

**Example call**
```json
{ "function": "getAllDailyInspectionLocomotivesCount", "args": {} }
```

---

## 9) `getAllLocomotiveLastInspectionDate` — Get last inspection per locomotive

**What it's for (admin intents it answers)**
- "Show last inspection for each locomotive"
- "Which locomotives were inspected most recently?"

**Params**
- None

**Returns**
- `Record<assetId, { assetId, date, title, testCode, user }>`

**Success criteria**
- result is an object/map

**Edge cases**
- empty object: no last-inspection records found
- missing fields in some entries: show what exists, do not invent

**Key fields to read**
- `<assetId>.date`
- `<assetId>.title`
- `<assetId>.testCode`
- `<assetId>.user`

**Example call**
```json
{ "function": "getAllLocomotiveLastInspectionDate", "args": {} }
```

---

## 10) `getAllLocomotiveDueInspectionDate` — Get next due inspection per locomotive

**What it's for (admin intents it answers)**
- "Which locomotives have inspections coming up?"
- "Show due dates for every locomotive"

**Params**
- None

**Returns**
- `Record<assetId, { assetId, nextExpiryDate, title, testCode }>`

**Success criteria**
- result is an object/map

**Edge cases**
- empty object: no due-inspection records found
- null/missing `nextExpiryDate`: due exists but date unknown; don't invent a date

**Key fields to read**
- `<assetId>.nextExpiryDate`
- `<assetId>.title`
- `<assetId>.testCode`

**Example call**
```json
{ "function": "getAllLocomotiveDueInspectionDate", "args": {} }
```

---

## 11) `getLocoNextDueLocoInspection` — Get next due inspection for a specific locomotive

**What it's for (admin intents it answers)**
- "When is the next inspection due for loco X?"
- "What's the next due inspection for assetId X?"

**Params**
- `assetId` (string, required)

**Returns**
- Either:
  - `{ assetId, nextExpiryDate, title, testCode }`
  - or `{}` (empty object) when nothing found

**Success criteria**
- result is an object
- and is either:
  - empty object, OR
  - non-empty with at least `assetId`, `title`, `testCode`

**Edge cases**
- `{}`: no due inspection found for that assetId (or assetId not in dataset)
- `nextExpiryDate: null`: record exists but due date unknown; do not fabricate

**Key fields to read**
- `nextExpiryDate`
- `title`
- `testCode`
- `assetId`

**Example call**
```json
{ "function": "getLocoNextDueLocoInspection", "args": { "assetId": "<ASSET_ID>" } }
```

---

## 12) `getLocoOutOfUseCredit` — Get out-of-use credit for a specific locomotive

**What it's for (admin intents it answers)**
- "What is the out-of-use credit for loco X?"
- "How many out-of-use days for assetId X?"

**Params**
- `assetId` (string, required)

**Returns**
- `{ credit: number, outOfUseDays: number, status: string }`

**Success criteria**
- object exists
- `credit` is number
- `outOfUseDays` is number
- `status` is string

**Edge cases**
- missing expected keys: treat as "no credit record returned"; verify assetId
- `credit == 0` or `outOfUseDays == 0`: valid; means none applicable

**Key fields to read**
- `credit`
- `outOfUseDays`
- `status`

**Example call**
```json
{ "function": "getLocoOutOfUseCredit", "args": { "assetId": "<ASSET_ID>" } }
```

---

# ❌ Blocked Functions (Side-effects / internal)

These functions are either **write operations** or **internal helpers**.
They are blocked in safe mode and should not be recommended by an advisor bot.

---

## A) `updateDashBoardLocoState` — BLOCKED

**Why it's blocked**
- Writes to `ReportModel` (updateOne) → side effects

**When it might be allowed**
- Usually **never** for an advisor bot.
- Only in a separate "maintenance mode" flow with explicit confirmation (e.g., `CONFIRM_WRITE`) and proper authorization.

---

## B) `updateLocoOutOfUseCredit` — BLOCKED

**Why it's blocked**
- Writes to `ReportModel` (updateOne) → side effects

**When it might be allowed**
- Same rule: only maintenance/admin pipeline with explicit confirmation.

---

## C) `updateDashBoardLocoInspection` — BLOCKED

**Why it's blocked**
- Writes inspection fields into `ReportModel` (updateOne) → side effects

**When it might be allowed**
- Maintenance mode only, with explicit confirmation and strict authorization.

---

## D) `updateDashBoardLocoMUId` — BLOCKED

**Why it's blocked**
- Writes MU id into `ReportModel` (updateOne) → side effects

**When it might be allowed**
- Maintenance mode only, with explicit confirmation.

---

## E) `dashBoardDataBuildUp` — BLOCKED

**Why it's blocked**
- Rebuilds and saves dashboard data (writes to ReportModel) → side effects

**When it might be allowed**
- Generally "never" for an advisor bot.
- If you ever allow it: maintenance mode only + explicit confirmation + logging + access control.

---

## F) `getLocoMUId` — BLOCKED (internal helper)

**Why it's blocked**
- Marked internal helper; not a user-facing query endpoint (even though it's read-only)

**When it might be allowed**
- Typically not recommended directly. It's intended to be used by other internal logic.

---

# How the chatbot should use this catalog (high level)

1. Match the user's question to an intent (keywords, hybrid retrieval, or LLM classifier).
2. Select candidate functions **only from Allowed/Recommendable + Read-only**.
3. If required parameters (e.g., `assetId`) are missing, ask a follow-up instead of guessing.
4. Output recommended calls strictly in the allowed shape:
   ```json
   { "function": "<name>", "args": { ... } }
   ```
5. UI executes the call (not the bot), then reads `readTheseFields` and formats using `presentation`.
6. If the call fails `successCriteria`, show the relevant edge-case guidance.

That's the whole point: **the chatbot is constrained to known capabilities** and can't invent tools, fields, or meanings.
