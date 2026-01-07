# QUESTION_TO_FUNCTION_MAP

Human-readable map from **admin questions** → **intent** → **recommended LiteDashboardService function call(s)**.

This document is generated from your `intentCatalog.ts` and is meant for debugging, routing rules (Step 7), and keeping the chatbot grounded (no invented tools).

## Conventions

- `"$assetId"`, `"$locoId"`, etc. inside call args are **templates** your app should substitute after entity extraction.

- `value.assetData.<assetId>...` uses `<assetId>` as a **placeholder key** because `assetData` is a map.

- **Safety**:
  - `safe` intents are allowed in advisor mode.
  - `maintenance_only` intents are blocked by default (write jobs/internal helpers).


## Table of contents

- [Dashboard and fleet KPIs](#dashboard-and-fleet-kpis)
- [Fleet lists and drilldowns](#fleet-lists-and-drilldowns)
- [Asset lookup and discovery](#asset-lookup-and-discovery)
- [Per-locomotive queries](#per-locomotive-queries)
- [Fleet-wide inspection maps and filters](#fleet-wide-inspection-maps-and-filters)
- [Test codes](#test-codes)
- [Maintenance-only and internal intents](#maintenance-only-and-internal-intents)
- [Other](#other)


## Dashboard and fleet KPIs

### COMPLIANT_COUNT

**Answers:** Count of compliant locomotives from dashboard summary.

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.summary.compliantLocomotives`

**If missing info:** —

**Synonyms / triggers:** compliant count, how many compliant, compliant locomotives

**Examples:**
- How many locomotives are compliant?
- Compliant count?

---

### DAILY_DUE_TODAY_COUNT

**Answers:** Count of locomotives due today for daily inspection (service day bounds).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getAllDailyInspectionLocomotivesCount({})
```

**Returns:** `getAllDailyInspectionLocomotivesCount -> number`

**Read fields:**
- `$`

**If missing info:** —

**Synonyms / triggers:** daily due today count, due today daily inspection, daily inspection due today

**Examples:**
- How many locomotives are due today for daily inspection?

---

### DAILY_INSPECTIONS_COMPLETED_KPI

**Answers:** Count of locomotives with daily inspections completed (dashboard summary).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.summary.locomotiveDailyInspections`

**If missing info:** —

**Synonyms / triggers:** daily inspections completed, daily inspections done, locomotiveDailyInspections

**Examples:**
- How many daily inspections are completed?
- Daily inspections completed KPI?

---

### DAILY_INSPECTIONS_DUE_KPI

**Answers:** Count of locomotives due for daily inspection (dashboard summary).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.summary.locomotivesDueForDailyInspec`

**If missing info:** —

**Synonyms / triggers:** daily inspections due, due for daily inspection, locomotivesDueForDailyInspec

**Examples:**
- How many are due for daily inspection?
- Daily inspections due KPI?

---

### DASHBOARD_OVERVIEW

**Answers:** Fetch the full dashboard payload (summary KPIs + per-locomotive map).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> { status:number, value:{ summary:{...}, assetData: Record<assetId,locoObj> } }`

**Read fields:**
- `status`
- `value.summary`
- `value.assetData`

**If missing info:** —

**Synonyms / triggers:** dashboard, overview, kpi, summary, show dashboard, home

**Examples:**
- Show me the dashboard overview.
- What are today's KPIs?
- Give me the summary stats.

---

### FLEET_SIZE_TOTAL

**Answers:** Total number of locomotives (count).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getAllLocomotivesCount({})
```

**Returns:** `getAllLocomotivesCount -> number`

**Read fields:**
- `$`

**If missing info:** —

**Synonyms / triggers:** how many locomotives, fleet size, total locomotives, total units

**Examples:**
- How many locomotives are in the fleet?
- Total number of locomotives?

---

### FLEET_SIZE_TOTAL_FROM_DASHBOARD

**Answers:** Total number of locomotives from dashboard summary.

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.summary.noOfLocomotives`

**If missing info:** —

**Synonyms / triggers:** noOfLocomotives, dashboard fleet count, fleet count (summary)

**Examples:**
- What's the fleet count in the dashboard summary?

---

### INSPECTIONS_COMPLETED_TODAY_COUNT

**Answers:** Count of inspections completed today (service timezone day bounds).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getAllInspectionsCompletedTodayCount({})
```

**Returns:** `getAllInspectionsCompletedTodayCount -> number`

**Read fields:**
- `$`

**If missing info:** —

**Synonyms / triggers:** inspections completed today, completed today count, today's inspections

**Examples:**
- How many inspections were completed today?
- Inspections completed today?

---

### NON_COMPLIANT_COUNT

**Answers:** Count of non-compliant locomotives (function returns a count).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getAllNonCompliantLocomotives({})
```

**Returns:** `getAllNonCompliantLocomotives -> number (count)`

**Read fields:**
- `$`

**If missing info:** —

**Synonyms / triggers:** non compliant count, noncompliant count, how many non compliant, compliance issues count

**Examples:**
- How many locomotives are non-compliant?
- Non-compliant count?

---

### NON_COMPLIANT_COUNT_FROM_DASHBOARD

**Answers:** Non-compliant count from dashboard summary.

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.summary.nonCompliantLocomotives`

**If missing info:** —

**Synonyms / triggers:** dashboard non compliant, nonCompliantLocomotives

**Examples:**
- What's the non-compliant KPI on the dashboard?

---

### OUT_OF_SERVICE_COUNT

**Answers:** Count of locomotives currently out of service.

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getAllOutOfServiceLocomotivesCount({})
```

**Returns:** `getAllOutOfServiceLocomotivesCount -> number`

**Read fields:**
- `$`

**If missing info:** —

**Synonyms / triggers:** out of service count, out of use count, how many are out, oos count

**Examples:**
- How many locomotives are out of service?
- Out of service count?

---

### OUT_OF_SERVICE_COUNT_FROM_DASHBOARD

**Answers:** Out-of-service count from dashboard summary.

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.summary.locomotivesOutOfService`

**If missing info:** —

**Synonyms / triggers:** dashboard out of service, locomotivesOutOfService

**Examples:**
- What's the out-of-service KPI on the dashboard?

---


## Fleet lists and drilldowns

### LIST_ALL_LOCOS_FROM_ASSET_SERVICE

**Answers:** List locomotives from the underlying assets source (raw assets list).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getAllLocomotives({})
```

**Returns:** `getAllLocomotives -> Array<any> (assets list)`

**Read fields:**
- `[].*_id`
- `[].attributes`

**If missing info:** —

**Synonyms / triggers:** assets list, all assets, getAllLocomotives, raw locomotives

**Examples:**
- Fetch all locomotives from the assets service.
- Show raw asset locomotive list.

---

### LIST_ALL_LOCOS_FROM_DASHBOARD

**Answers:** List all locomotives from dashboard assetData map.

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData`
- `value.assetData.<assetId>.id`
- `value.assetData.<assetId>.locoNo`
- `value.assetData.<assetId>.name`
- `value.assetData.<assetId>.muId`

**If missing info:** —

**Synonyms / triggers:** list locomotives, show all locos, all locomotives, fleet list

**Examples:**
- List all locomotives.
- Show me the locomotive list.

---

### LIST_AVAILABLE_LOCOS

**Answers:** List locomotives where assetStates.outOfUse is false (client-side filter).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.assetStates.outOfUse`
- `value.assetData.<assetId>.locoNo`
- `value.assetData.<assetId>.name`

**If missing info:** —

**Synonyms / triggers:** available locomotives, in service locomotives, not out of service, available list

**Examples:**
- Which locomotives are available?
- List locomotives that are not out of service.

**Notes:** Filter: assetStates.outOfUse === false

---

### LIST_DAILY_DUE_LOCOS_TODAY

**Answers:** List locomotives due today for daily inspection (client-side filter).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.assetStates.dailyDue`
- `value.assetData.<assetId>.locoNo`
- `value.assetData.<assetId>.name`

**If missing info:** Do you mean due *today* (within the service's day bounds) or a custom date range?

**Synonyms / triggers:** daily due list, due today list, daily inspection due list, who is due today

**Examples:**
- Which locomotives are due today for daily inspection?
- List daily-due locomotives today.

**Notes:** Filter: assetStates.dailyDue within startOfDay/endOfDay (US/Eastern), or filter client-side by date range.

---

### LIST_LOCOS_MISSING_DUE_INSPECTION

**Answers:** List locomotives with missing/empty DueInspec (client-side filter).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.DueInspec`
- `value.assetData.<assetId>.locoNo`
- `value.assetData.<assetId>.name`

**If missing info:** —

**Synonyms / triggers:** missing due inspection, no due inspection, due inspection missing

**Examples:**
- Which locomotives are missing a due inspection record?

**Notes:** Filter: DueInspec is empty object / null

---

### LIST_LOCOS_MISSING_LAST_INSPECTION

**Answers:** List locomotives with missing/empty LastInspec (client-side filter).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.LastInspec`
- `value.assetData.<assetId>.locoNo`
- `value.assetData.<assetId>.name`

**If missing info:** —

**Synonyms / triggers:** missing last inspection, no last inspection, last inspection missing

**Examples:**
- Which locomotives have no last inspection record?

**Notes:** Filter: LastInspec is empty object / null

---

### LIST_LOCOS_WITH_ENGINE_HOURS_OVER_THRESHOLD

**Answers:** List locomotives with engine hours over a threshold (client-side filter).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** `thresholdHours`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.assetStates.engineHour`
- `value.assetData.<assetId>.locoNo`
- `value.assetData.<assetId>.name`

**If missing info:** What engine-hour threshold should I use (e.g., 10000)?

**Synonyms / triggers:** engine hours over, hours threshold, high engine hours, over threshold hours

**Examples:**
- List locomotives with engine hours over 10,000.
- Which locos exceed 20k engine hours?

**Notes:** Filter: assetStates.engineHour > thresholdHours

---

### LIST_LOCOS_WITH_OOU_CREDIT_AVAILABLE

**Answers:** List locomotives with outOfUseCredit.status indicating available credit (client-side filter).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.outOfUseCredit.status`
- `value.assetData.<assetId>.outOfUseCredit.credit`
- `value.assetData.<assetId>.locoNo`
- `value.assetData.<assetId>.name`

**If missing info:** —

**Synonyms / triggers:** oou credit available, out of use credit available, credit available list

**Examples:**
- Which locomotives have out-of-use credit available?

**Notes:** Filter: outOfUseCredit.status (e.g., 'Available')

---

### LIST_NON_COMPLIANT_LOCOS

**Answers:** List locomotives where assetStates.nonCompliant is true (client-side filter).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.assetStates.nonCompliant`
- `value.assetData.<assetId>.locoNo`
- `value.assetData.<assetId>.name`

**If missing info:** —

**Synonyms / triggers:** list non compliant, which are non compliant, noncompliant locomotives

**Examples:**
- List all non-compliant locomotives.
- Which locomotives are non-compliant?

**Notes:** Filter: assetStates.nonCompliant === true

---

### LIST_OUT_OF_SERVICE_LOCOS

**Answers:** List locomotives where assetStates.outOfUse is true (client-side filter).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.assetStates.outOfUse`
- `value.assetData.<assetId>.locoNo`
- `value.assetData.<assetId>.name`

**If missing info:** —

**Synonyms / triggers:** list out of service, which are out of service, out of use locos, oos list

**Examples:**
- Which locomotives are out of service?
- List out-of-service locomotives.

**Notes:** Filter: assetStates.outOfUse === true

---

### LIST_TEST_CODES

**Answers:** List all active test codes.

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getAllTestCodes({})
```

**Returns:** `getAllTestCodes -> string[]`

**Read fields:**
- `$`

**If missing info:** —

**Synonyms / triggers:** list test codes, all test codes, available test codes

**Examples:**
- List all test codes.
- What test codes exist?

---


## Asset lookup and discovery

### FIND_LOCO_BY_ASSET_ID

**Answers:** Find a locomotive in dashboard assetData by assetId.

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>`

**If missing info:** What is the locomotive assetId?

**Synonyms / triggers:** find by asset id, assetId, lookup asset id, locate asset id

**Examples:**
- Find locomotive with assetId 68efe....
- Show details for assetId XYZ.

---

### FIND_LOCO_BY_LOCO_NUMBER

**Answers:** Find locomotive(s) by loco number (client-side search over dashboard assetData).

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `locoNo`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.locoNo`
- `value.assetData.<assetId>.id`
- `value.assetData.<assetId>.name`

**If missing info:** Which locomotive number (e.g., 4430)?

**Synonyms / triggers:** loco number, locomotive number, unit number, engine number, locoNo

**Examples:**
- Find loco 4430.
- Do we have locomotive number 8772?

**Notes:** Client-side match: locoNo equals/contains provided locoNo. If multiple, ask user to pick one.

---

### FIND_LOCO_BY_NAME

**Answers:** Find locomotive(s) by name (client-side search over dashboard assetData).

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `name`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.name`
- `value.assetData.<assetId>.id`
- `value.assetData.<assetId>.locoNo`

**If missing info:** Which locomotive name (or a unique fragment)?

**Synonyms / triggers:** loco name, unitId, name contains, search name

**Examples:**
- Find locomotive named SD70M 4430.
- Search locomotives by name 'GP38'.

**Notes:** Client-side match: name contains provided text. If multiple, ask user to pick one.

---


## Per-locomotive queries

### LOCO_AUTO_BLUECARD_INITIALIZE_FLAG

**Answers:** Read autoBlueCardInitialize flag for a locomotive.

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.assetStates.autoBlueCardInitialize`

**If missing info:** Which locomotive (assetId or number)?

**Synonyms / triggers:** auto bluecard, blue card initialize, autoBlueCardInitialize

**Examples:**
- Is auto bluecard initialize set for loco 4430?

---

### LOCO_BASIC_METADATA

**Answers:** Read basic locomotive metadata (id, number, name, MU id).

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.id`
- `value.assetData.<assetId>.locoNo`
- `value.assetData.<assetId>.name`
- `value.assetData.<assetId>.muId`

**If missing info:** Which locomotive (assetId or number)?

**Synonyms / triggers:** loco details, metadata, basic info, id name number, mu id

**Examples:**
- Show basic info for loco 4430.
- What are the details for assetId XYZ?

---

### LOCO_DAILY_DUE_DATE

**Answers:** Get daily due timestamp/date for a locomotive (if present).

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.assetStates.dailyDue`

**If missing info:** Which locomotive (assetId or number)?

**Synonyms / triggers:** daily due for loco, daily inspection due date, when is daily due, dailyDue

**Examples:**
- When is loco 4430 due for daily inspection?
- Daily due date for assetId XYZ?

---

### LOCO_DUE_INSPECTION_FROM_DASHBOARD

**Answers:** Read due inspection fields from dashboard-stored assetData.

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.DueInspec.nextExpiryDate`
- `value.assetData.<assetId>.DueInspec.title`
- `value.assetData.<assetId>.DueInspec.testCode`

**If missing info:** Which locomotive (assetId or number)?

**Synonyms / triggers:** due inspection (dashboard), stored due inspection, DueInspec

**Examples:**
- Show stored due inspection fields for loco 4430.

---

### LOCO_ENGINE_HOURS

**Answers:** Get engine hours for a locomotive.

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.assetStates.engineHour`

**If missing info:** Which locomotive (assetId or number)?

**Synonyms / triggers:** engine hours, hours on engine, engineHour, running hours

**Examples:**
- How many engine hours does loco 4430 have?
- Engine hours for assetId XYZ?

---

### LOCO_LAST_INSPECTION_DATE_ONLY

**Answers:** Read last inspection date from dashboard-stored assetData.

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.LastInspec.date`

**If missing info:** Which locomotive (assetId or number)?

**Synonyms / triggers:** last inspection date, date of last inspection, when last inspected

**Examples:**
- What's the last inspection date for loco 4430?

---

### LOCO_LAST_INSPECTION_INSPECTOR_EMAIL

**Answers:** Read last inspection inspector email from dashboard-stored assetData (PII).

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.LastInspec.user.email`

**If missing info:** Which locomotive (assetId or number)?

**Synonyms / triggers:** inspector email, email of inspector, contact inspector

**Examples:**
- What's the inspector email for loco 4430's last inspection?

**Notes:** PII: email should be redacted unless explicitly allowed by your policy.

---

### LOCO_LAST_INSPECTION_INSPECTOR_NAME

**Answers:** Read last inspection inspector name from dashboard-stored assetData.

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.LastInspec.user.name`

**If missing info:** Which locomotive (assetId or number)?

**Synonyms / triggers:** who inspected, inspector name, performed by, inspected by

**Examples:**
- Who did the last inspection on loco 4430?

**Notes:** PII: name only is typically acceptable; follow your redaction policy.

---

### LOCO_LAST_INSPECTION_SUMMARY

**Answers:** Read last inspection summary from dashboard-stored assetData.

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.LastInspec.date`
- `value.assetData.<assetId>.LastInspec.title`
- `value.assetData.<assetId>.LastInspec.testCode`

**If missing info:** Which locomotive (assetId or number)?

**Synonyms / triggers:** last inspection, most recent inspection, previous inspection, LastInspec

**Examples:**
- When was loco 4430 last inspected?
- Show last inspection for assetId XYZ.

---

### LOCO_LAST_INSPECTION_TEST_CODE_ONLY

**Answers:** Read last inspection test code from dashboard-stored assetData.

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.LastInspec.testCode`

**If missing info:** Which locomotive (assetId or number)?

**Synonyms / triggers:** last test code, previous inspection code, last inspection code

**Examples:**
- What was the last inspection test code for loco 4430?

---

### LOCO_LAST_INSPECTION_TITLE_ONLY

**Answers:** Read last inspection title from dashboard-stored assetData.

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.LastInspec.title`

**If missing info:** Which locomotive (assetId or number)?

**Synonyms / triggers:** last inspection title, what inspection was last, previous inspection type

**Examples:**
- What was the last inspection type for loco 4430?

---

### LOCO_MU_ID_MISSING_EXPLAIN

**Answers:** Explain/confirm whether MU id is missing for a locomotive.

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.muId`

**If missing info:** Which locomotive (assetId or number)?

**Synonyms / triggers:** mu id missing, no mu id, why mu id blank, mu not set

**Examples:**
- Does loco 4430 have an MU id set?
- Why is MU id missing for assetId XYZ?

**Notes:** If muId is null/empty, answer as 'not set' and optionally suggest maintenance update.

---

### LOCO_MU_ID_READ

**Answers:** Read MU id for a locomotive (from dashboard).

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.muId`

**If missing info:** Which locomotive (assetId or number)?

**Synonyms / triggers:** mu id, multiple unit id, consist id, muId

**Examples:**
- What's the MU id for loco 4430?
- MU id for assetId XYZ?

---

### LOCO_NEXT_DUE_INSPECTION

**Answers:** Get the next due inspection for a locomotive (service helper).

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getLocoNextDueLocoInspection(
  {
    "assetId": "$assetId"
  }
)
```

**Returns:** `getLocoNextDueLocoInspection -> { assetId, nextExpiryDate, title, testCode } | {}`

**Read fields:**
- `nextExpiryDate`
- `title`
- `testCode`

**If missing info:** Which locomotive assetId (or loco number so I can look it up)?

**Synonyms / triggers:** next inspection due, next due inspection, when is next due, upcoming inspection, expiry date

**Examples:**
- When is loco 4430 due next?
- Next inspection due for assetId XYZ?

---

### LOCO_NEXT_DUE_INSPECTION_DATE_ONLY

**Answers:** Get next due inspection date for a locomotive.

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getLocoNextDueLocoInspection(
  {
    "assetId": "$assetId"
  }
)
```

**Returns:** `getLocoNextDueLocoInspection -> { assetId, nextExpiryDate, title, testCode } | {}`

**Read fields:**
- `nextExpiryDate`

**If missing info:** Which locomotive assetId (or loco number so I can look it up)?

**Synonyms / triggers:** next expiry date, due date only, when due

**Examples:**
- What's the next due date for loco 4430?

---

### LOCO_NEXT_DUE_INSPECTION_TEST_CODE_ONLY

**Answers:** Get next due inspection test code for a locomotive.

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getLocoNextDueLocoInspection(
  {
    "assetId": "$assetId"
  }
)
```

**Returns:** `getLocoNextDueLocoInspection -> { assetId, nextExpiryDate, title, testCode } | {}`

**Read fields:**
- `testCode`

**If missing info:** Which locomotive assetId (or loco number so I can look it up)?

**Synonyms / triggers:** next test code, due test code, inspection code

**Examples:**
- What's the next due inspection test code for loco 4430?

---

### LOCO_NEXT_DUE_INSPECTION_TITLE_ONLY

**Answers:** Get next due inspection title for a locomotive.

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getLocoNextDueLocoInspection(
  {
    "assetId": "$assetId"
  }
)
```

**Returns:** `getLocoNextDueLocoInspection -> { assetId, nextExpiryDate, title, testCode } | {}`

**Read fields:**
- `title`

**If missing info:** Which locomotive assetId (or loco number so I can look it up)?

**Synonyms / triggers:** next inspection title, inspection type, due inspection name

**Examples:**
- What inspection is due next for loco 4430?

---

### LOCO_OUT_OF_USE_CREDIT_FROM_DASHBOARD

**Answers:** Read out-of-use credit values from dashboard-stored assetData.

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.outOfUseCredit.credit`
- `value.assetData.<assetId>.outOfUseCredit.outOfUseDays`
- `value.assetData.<assetId>.outOfUseCredit.status`

**If missing info:** Which locomotive (assetId or number)?

**Synonyms / triggers:** oou credit (dashboard), credit from dashboard, stored credit

**Examples:**
- Show me the stored OOU credit fields for loco 4430.

---

### LOCO_OUT_OF_USE_CREDIT_SUMMARY

**Answers:** Get out-of-use credit summary for a locomotive.

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getLocoOutOfUseCredit(
  {
    "assetId": "$assetId"
  }
)
```

**Returns:** `getLocoOutOfUseCredit -> { credit:number, outOfUseDays:number, status:string }`

**Read fields:**
- `credit`
- `outOfUseDays`
- `status`

**If missing info:** Which locomotive assetId (or loco number so I can look it up)?

**Synonyms / triggers:** out of use credit, oou credit, credit summary, credit status

**Examples:**
- What's the out-of-use credit for loco 4430?
- Show OOU credit summary for assetId XYZ.

---

### LOCO_OUT_OF_USE_CREDIT_VALUE_ONLY

**Answers:** Get out-of-use credit value for a locomotive.

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getLocoOutOfUseCredit(
  {
    "assetId": "$assetId"
  }
)
```

**Returns:** `getLocoOutOfUseCredit -> { credit:number, outOfUseDays:number, status:string }`

**Read fields:**
- `credit`

**If missing info:** Which locomotive assetId (or loco number so I can look it up)?

**Synonyms / triggers:** credit amount, oou credit value, credit balance

**Examples:**
- How much out-of-use credit does loco 4430 have?

---

### LOCO_OUT_OF_USE_DATE

**Answers:** Get out-of-use date for a locomotive (if present).

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.assetStates.outOfUseDate`

**If missing info:** Which locomotive (assetId or number)?

**Synonyms / triggers:** out of use date, when taken out of service, out of service date, oou date

**Examples:**
- When was loco 4430 marked out of use?
- Out-of-use date for assetId XYZ?

---

### LOCO_OUT_OF_USE_DAYS_ONLY

**Answers:** Get out-of-use days for a locomotive.

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getLocoOutOfUseCredit(
  {
    "assetId": "$assetId"
  }
)
```

**Returns:** `getLocoOutOfUseCredit -> { credit:number, outOfUseDays:number, status:string }`

**Read fields:**
- `outOfUseDays`

**If missing info:** Which locomotive assetId (or loco number so I can look it up)?

**Synonyms / triggers:** out of use days, days out of use, oou days

**Examples:**
- How many days has loco 4430 been out of use?

---

### LOCO_STATUS_NON_COMPLIANT

**Answers:** Check whether a locomotive is non-compliant.

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.assetStates.nonCompliant`

**If missing info:** Which locomotive (assetId or number)?

**Synonyms / triggers:** non compliant status, is it non compliant, compliance status, violations status

**Examples:**
- Is loco 8772 non-compliant?
- Non-compliant status for assetId XYZ?

---

### LOCO_STATUS_OUT_OF_USE

**Answers:** Check whether a locomotive is out of use.

**Requires locomotive?** Yes

**Safety:** `safe`

**Required entries:** `assetId`

**Recommend:**

```ts
getDashBoardData({})
```

**Returns:** `getDashBoardData -> dashboard payload`

**Read fields:**
- `value.assetData.<assetId>.assetStates.outOfUse`

**If missing info:** Which locomotive (assetId or number)?

**Synonyms / triggers:** out of use status, out of service status, is it out of use, available status

**Examples:**
- Is loco 4430 out of use?
- Out-of-service status for assetId XYZ?

---


## Fleet-wide inspection maps and filters

### FLEET_DUE_BY_TEST_CODE

**Answers:** List locos with due inspection for a test code (client-side filter).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** `testCode`

**Recommend:**

```ts
getAllLocomotiveDueInspectionDate({})
```

**Returns:** `getAllLocomotiveDueInspectionDate -> map`

**Read fields:**
- `<assetId>.testCode`
- `<assetId>.nextExpiryDate`
- `<assetId>.title`

**If missing info:** Which test code?

**Synonyms / triggers:** due by test code, due inspections for code, which are due for test

**Examples:**
- Which locomotives are due for test code XYZ?

**Notes:** Client-side filter: testCode match

---

### FLEET_DUE_INSPECTION_MAP

**Answers:** Get due inspection record per locomotive (map).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getAllLocomotiveDueInspectionDate({})
```

**Returns:** `getAllLocomotiveDueInspectionDate -> Record<assetId,{ assetId,nextExpiryDate,title,testCode }>`

**Read fields:**
- `<assetId>.nextExpiryDate`
- `<assetId>.title`
- `<assetId>.testCode`

**If missing info:** —

**Synonyms / triggers:** fleet due inspection map, all due inspections, due inspections for all

**Examples:**
- Show due inspections for all locomotives.
- Get fleet due inspection map.

---

### FLEET_DUE_IN_NEXT_30_DAYS

**Answers:** List locos with inspections due in next 30 days (client-side filter).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getAllLocomotiveDueInspectionDate({})
```

**Returns:** `getAllLocomotiveDueInspectionDate -> map`

**Read fields:**
- `<assetId>.nextExpiryDate`
- `<assetId>.title`
- `<assetId>.testCode`

**If missing info:** —

**Synonyms / triggers:** due in next 30 days, due this month, upcoming due within 30 days

**Examples:**
- Which locomotives are due in the next 30 days?

**Notes:** Client-side filter: now <= nextExpiryDate <= now+30d

---

### FLEET_DUE_IN_NEXT_7_DAYS

**Answers:** List locos with inspections due in next 7 days (client-side filter).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getAllLocomotiveDueInspectionDate({})
```

**Returns:** `getAllLocomotiveDueInspectionDate -> map`

**Read fields:**
- `<assetId>.nextExpiryDate`
- `<assetId>.title`
- `<assetId>.testCode`

**If missing info:** —

**Synonyms / triggers:** due in next 7 days, due within a week, upcoming due this week

**Examples:**
- Which locomotives are due in the next 7 days?

**Notes:** Client-side filter: now <= nextExpiryDate <= now+7d

---

### FLEET_LAST_INSPECTED_WITHIN_RANGE

**Answers:** List locos last-inspected within a date range (client-side filter).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** `startDate`, `endDate`

**Recommend:**

```ts
getAllLocomotiveLastInspectionDate({})
```

**Returns:** `getAllLocomotiveLastInspectionDate -> map`

**Read fields:**
- `<assetId>.date`
- `<assetId>.title`
- `<assetId>.testCode`

**If missing info:** What date range should I use? (start + end)

**Synonyms / triggers:** last inspected between, inspected within range, inspected from, inspection date range

**Examples:**
- Which locomotives were inspected between 2025-01-01 and 2025-01-31?

**Notes:** Client-side filter: startDate <= date <= endDate

---

### FLEET_LAST_INSPECTION_BY_TEST_CODE

**Answers:** List locos by last inspection testCode (client-side filter).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** `testCode`

**Recommend:**

```ts
getAllLocomotiveLastInspectionDate({})
```

**Returns:** `getAllLocomotiveLastInspectionDate -> map`

**Read fields:**
- `<assetId>.testCode`
- `<assetId>.date`
- `<assetId>.title`

**If missing info:** Which test code?

**Synonyms / triggers:** last inspection test code, last inspected with code, by testCode last

**Examples:**
- Which locomotives last had test code AIR?
- Show last inspections with test code XYZ.

**Notes:** Client-side filter: testCode match

---

### FLEET_LAST_INSPECTION_MAP

**Answers:** Get last inspection record per locomotive (map).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getAllLocomotiveLastInspectionDate({})
```

**Returns:** `getAllLocomotiveLastInspectionDate -> Record<assetId,{ assetId,date,title,testCode,user }>`

**Read fields:**
- `<assetId>.date`
- `<assetId>.title`
- `<assetId>.testCode`
- `<assetId>.user`

**If missing info:** —

**Synonyms / triggers:** fleet last inspection map, all last inspections, last inspections for all

**Examples:**
- Get last inspection for every locomotive.
- Show fleet last inspection map.

---


## Test codes

### VALIDATE_TEST_CODE_EXISTS

**Answers:** Check if a given test code exists (client-side membership check).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** `testCode`

**Recommend:**

```ts
getAllTestCodes({})
```

**Returns:** `getAllTestCodes -> string[]`

**Read fields:**
- `$`

**If missing info:** Which test code are you checking?

**Synonyms / triggers:** is test code valid, does test code exist, validate test code

**Examples:**
- Is test code ABC valid?
- Does test code XYZ exist?

**Notes:** Client-side: check testCode in returned array

---


## Maintenance-only and internal intents

### INTERNAL_RESOLVE_MU_HEAD_HELPER

**Answers:** Internal helper to resolve MU id/head from a locomotive list (not recommended to end users).

**Requires locomotive?** Yes

**Safety:** `maintenance_only` (blocked by default)

**Required entries:** `locoId`, `locos`

**Recommend:**

```ts
getLocoMUId(
  {
    "locoId": "$locoId",
    "locos": "$locos"
  }
)
```

**Returns:** `getLocoMUId -> string | null (internal helper)`

**Read fields:**
- `$`

**If missing info:** This is an internal helper. Provide locoId and a locos array (usually value.assetData values).

**Synonyms / triggers:** getLocoMUId helper, resolve mu head, mu head helper

**Examples:**
- Resolve MU head for locoId XYZ given locos list.

**Notes:** Function exists but is not recommendable in advisor mode.

---

### MAINT_RECALC_OOU_CREDIT_AND_SAVE

**Answers:** Recalculate and update out-of-use credit for a locomotive (write).

**Requires locomotive?** Yes

**Safety:** `maintenance_only` (blocked by default)

**Required entries:** `locoId`, `confirmWrite`

**Recommend:**

```ts
updateLocoOutOfUseCredit(
  {
    "locoId": "$locoId"
  }
)
```

**Returns:** `updateLocoOutOfUseCredit -> (implementation-defined)`

**Read fields:**
- `$`

**If missing info:** This action has side effects. Provide locoId and confirm with CONFIRM_WRITE.

**Synonyms / triggers:** recalculate oou credit, update oou credit, recompute credit, updateLocoOutOfUseCredit

**Examples:**
- Recalculate OOU credit for locoId XYZ.
- Update out-of-use credit for this loco.

**Notes:** Blocked by default in advisor mode (write/side-effect).

---

### MAINT_REFRESH_REBUILD_DASHBOARD

**Answers:** Rebuild/refresh the stored dashboard data (bulk write job).

**Requires locomotive?** No

**Safety:** `maintenance_only` (blocked by default)

**Required entries:** `confirmWrite`

**Recommend:**

```ts
dashBoardDataBuildUp({})
```

**Returns:** `dashBoardDataBuildUp -> (implementation-defined)`

**Read fields:**
- `$`

**If missing info:** This action has side effects. If you really want it, confirm with CONFIRM_WRITE.

**Synonyms / triggers:** rebuild dashboard, refresh dashboard data, recalculate dashboard, build up dashboard

**Examples:**
- Rebuild the dashboard data.
- Refresh the stored dashboard payload.

**Notes:** Blocked by default in advisor mode (write/side-effect).

---

### MAINT_UPDATE_LAST_AND_DUE_INSPECTION_FIELDS

**Answers:** Update stored last/due inspection fields in dashboard (write).

**Requires locomotive?** Yes

**Safety:** `maintenance_only` (blocked by default)

**Required entries:** `date`, `unitId`, `title`, `testCode`, `userObject`, `confirmWrite`

**Recommend:**

```ts
updateDashBoardLocoInspection(
  {
    "date": "$date",
    "unit": {
      "id": "$unitId"
    },
    "testInfo": {
      "title": "$title",
      "testCode": "$testCode",
      "user": "$userObject"
    }
  }
)
```

**Returns:** `updateDashBoardLocoInspection -> (implementation-defined)`

**Read fields:**
- `$`

**If missing info:** This action has side effects. Provide date, unitId, test title, test code, user info, and confirm with CONFIRM_WRITE.

**Synonyms / triggers:** update inspection in dashboard, set last inspection, update due inspection, updateDashBoardLocoInspection

**Examples:**
- Update dashboard inspection fields for unitId XYZ with test code ABC on date 2025-01-01.

**Notes:** Blocked by default in advisor mode (write/side-effect).

---

### MAINT_UPDATE_LOCO_STATE_IN_DASHBOARD

**Answers:** Update stored dashboard state for a locomotive (write).

**Requires locomotive?** Yes

**Safety:** `maintenance_only` (blocked by default)

**Required entries:** `locoId`, `confirmWrite`

**Recommend:**

```ts
updateDashBoardLocoState(
  {
    "locoId": "$locoId"
  }
)
```

**Returns:** `updateDashBoardLocoState -> (implementation-defined)`

**Read fields:**
- `$`

**If missing info:** This action has side effects. Provide locoId and confirm with CONFIRM_WRITE.

**Synonyms / triggers:** update loco state, refresh loco state, recompute loco state, updateDashBoardLocoState

**Examples:**
- Update the dashboard state for locoId XYZ.
- Refresh loco state in dashboard for this loco.

**Notes:** Blocked by default in advisor mode (write/side-effect).

---

### MAINT_UPDATE_MU_ID_FIELD

**Answers:** Update stored MU id for a locomotive in dashboard (write).

**Requires locomotive?** Yes

**Safety:** `maintenance_only` (blocked by default)

**Required entries:** `locoId`, `confirmWrite`

**Recommend:**

```ts
updateDashBoardLocoMUId(
  {
    "locoId": "$locoId"
  }
)
```

**Returns:** `updateDashBoardLocoMUId -> (implementation-defined)`

**Read fields:**
- `$`

**If missing info:** This action has side effects. Provide locoId and confirm with CONFIRM_WRITE.

**Synonyms / triggers:** update mu id, refresh mu id, updateDashBoardLocoMUId

**Examples:**
- Update MU id in dashboard for locoId XYZ.

**Notes:** Blocked by default in advisor mode (write/side-effect).

---


## Other

### FLEET_OVERDUE_INSPECTIONS

**Answers:** List locos with overdue inspections (client-side filter).

**Requires locomotive?** No

**Safety:** `safe`

**Required entries:** —

**Recommend:**

```ts
getAllLocomotiveDueInspectionDate({})
```

**Returns:** `getAllLocomotiveDueInspectionDate -> map`

**Read fields:**
- `<assetId>.nextExpiryDate`
- `<assetId>.title`
- `<assetId>.testCode`

**If missing info:** Should I exclude locomotives with no due date (missing nextExpiryDate), or list them as 'unknown'?

**Synonyms / triggers:** overdue inspections, past due, expired inspections, overdue list

**Examples:**
- Which locomotives are overdue for inspection?

**Notes:** Client-side filter: nextExpiryDate < now

---
