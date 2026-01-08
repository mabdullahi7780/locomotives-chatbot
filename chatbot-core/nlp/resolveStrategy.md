# resolverStrategy.md — Locomotive Entity Resolution

## 1) Purpose

This document defines the **deterministic resolver** that converts extracted locomotive candidates from `extractLocoQuery.ts` into a **specific locomotive** using dashboard data.

- The resolver’s job is to **ground** user text (“loco 123”, “4430 SD70M”) to a real locomotive record in the data.
- The chatbot is **suggest-only**:
  - ✅ It may **recommend** calls like `getDashBoardData()`
  - ❌ It must **never execute** any function
- The resolver must be **hallucination-resistant**:
  - If the locomotive cannot be found in the available data, the bot must say so and ask for clarification or suggest refreshing data.

**Important UX rule:** User-facing text must refer to locomotives by **locomotive name** (the full name label, e.g. “4430 SD70M”) and optionally the **loco number**.  
The **assetId is backend-only** and should not be shown to the user in normal responses.

---

## 2) Definitions

**Candidate**  
One extracted entity from the user message, produced by `extractLocoQuery.ts`:
- `assetIds[]` (24-hex tokens)
- `locoNos[]` (3–5 digit identifiers)
- `names[]` (e.g., “4430 SD70M”, “903 EMD SL-1”, or model tokens like “SD70M”)

**Resolved loco**  
A locomotive record that exists in dashboard data:
- Identified internally by `assetId` (the key in `value.assetData`)
- Presented to users by **name** (and optionally `locoNo`)

**Ambiguous**  
More than one locomotive matches the same candidate (e.g., multiple locos share the same `locoNo`, or multiple name matches).

**Confidence**
From `extractLocoQuery.ts`:
- `high`: at least one `assetId` candidate exists (still must be validated against data)
- `medium`: one or more loco numbers or numbered names found
- `low`: no strong loco identifiers; model-only tokens or nothing extracted

---

## 3) Required data

Resolution requires **dashboard locomotive data** in one of these forms:

### A) Snapshot (default)
A locally available snapshot from `dashboardDataJSON.js`.  
This is considered the “current known data” for resolution.

### B) Refreshed data (recommended when needed)
A fresh payload returned by:
- `getDashBoardData()` → `value.assetData`

### Resolver context flag (required for refresh logic)
The bot cannot actually know whether the dashboard data was refreshed unless the app passes a flag.  
Your app should provide **one** of these in resolver context:

- `context.dashboardDataFresh: boolean`  
  - `false` means the resolver is operating on the snapshot/stale data
  - `true` means the resolver is operating on freshly fetched data
**OR**
- `context.lastDashboardFetchAt: string | number`  
  - a timestamp the app updates when it runs `getDashBoardData()`

**Behavior using the flag:**
- If `dashboardDataFresh === false` and the locomotive is not found in the snapshot → recommend `getDashBoardData()`.
- If `dashboardDataFresh === true` (or `lastDashboardFetchAt` is recent) and the locomotive is still not found → tell the user the locomotive is not in the database and ask them to re-check the loco number/name.

### Required fields for matching
From `value.assetData` entries:
- `assetId` (implicit as the object key)
- `locoNo`
- `name`

---

## 4) Matching rules (strict priority order)

The resolver must follow these rules **in order**, and must remain deterministic.

### Rule A — assetId beats everything
For each `assetId` in `assetIds[]`:
1. Check if `assetId` exists as a key in `assetData`.
2. If exactly one exists → **Resolved**
3. If multiple exist → **Disambiguate** (rare; usually indicates user pasted multiple IDs)
4. If none exist → treat as invalid and continue to Rule B (do not guess)

**User-facing rule:** even if `assetId` was provided, the bot still speaks in terms of the locomotive **name** after resolving.

---

### Rule B — locoNo exact match
For each `locoNo` in `locoNos[]`:

**Normalization:**
- Compare using normalized strings:
  - `normalizeLocoNo(x) = String(x).trim()`
- Try exact string match first.
- Optional safe fallback: if exact match fails and the user provided leading zeros, you may try numeric equality **only** as a fallback:
  - `Number(asset.locoNo) === Number(userLocoNo)`
  - If that yields multiple matches → disambiguate (do not guess)

**Matching:**
- Find all entries where `asset.locoNo === locoNo` (normalized)
- If exactly 1 match → **Resolved**
- If >1 match → **Disambiguate**
- If 0 match → continue to Rule C

---

### Rule C — name exact match (case-insensitive)
For each `name` in `names[]`:

**Normalization:**
- `normalizeName(x) = String(x).trim().toLowerCase()`

**Matching:**
- Find all entries where `normalizeName(asset.name) === normalizeName(candidateName)`
- If exactly 1 match → **Resolved**
- If >1 match → **Disambiguate**
- If 0 match → continue to Rule D

---

### Rule D — name fuzzy match (optional + cautious)

**Default: NOT IMPLEMENTED (recommended for hallucination-averse behavior).**  
If not implemented, do not attempt fuzzy matching—go directly to follow-up / refresh logic.

If implemented later, fuzzy matching must be narrow and safe:
- Only allow fuzzy matching when:
  - The extracted name **starts with a loco number** (e.g., `^\d{3,5}\b`)
  - OR confidence is `high|medium` and the best match score is clearly ahead (large margin)
- If score gap between top results is small → **Disambiguate**, do not pick.

---

## 5) Multi-entity messages

Users may mention more than one locomotive:

Examples:
- “Compare 4430 and 8778”
- “Next inspection for loco 123 and loco 456”

Resolver behavior:
1. Resolve each candidate independently using Rules A–D.
2. Produce one of:
   - **Resolved list** (each resolves uniquely)
   - **Mixed result** (some resolved, some need follow-up)
   - **Disambiguation** for any ambiguous candidates

Downstream handling:
- If the detected intent supports **multi-loco**, the chatbot may recommend one call per resolved loco (backend uses assetId internally).
- If the intent is **single-loco only**, the bot must ask:
  - “Which locomotive do you want to use for this request?” and provide a short list of resolved options.

---

## 6) Disambiguation policy

If multiple locomotives match a candidate:
- Show **3–5** options max.
- Each option should include (user-facing):
  - **name** (primary)
  - `locoNo` (secondary, if available)

**Do not show assetId to the user.**  
If the UI needs a stable selection token, it may store assetId internally, but it should not be presented as “the asset number” to the user.

Disambiguation question text:
- “I found multiple locomotives that match that. Which one did you mean?”

Example options format (user-facing):
- “4430 SD70M (loco 4430)”
- “4430 GP38-2 (loco 4430)”
- “4430 AC44C6M (loco 4430)”

---

## 7) Follow-up policy (when you cannot resolve)

### Triggers for `needs_followup`
Return `needs_followup` when:
- No candidates extracted (`assetIds[]`, `locoNos[]`, `names[]` all empty)
- Candidates exist but **none match** the current dashboard data
- Confidence is `low` and matches would be weak/guessy
- Candidate(s) look valid but match is ambiguous and user must choose

### Required follow-up question text (default)
If missing loco:
- “Which locomotive do you mean? Please provide the locomotive number (e.g., 4430) or the full locomotive name (e.g., 4430 SD70M).”

### Snapshot-miss behavior (important)
The bot has access to the snapshot in `dashboardDataJSON.js`. If the locomotive is not found:

**If `context.dashboardDataFresh === false` (or `lastDashboardFetchAt` is missing/old):**
1. Tell the user:
   - “I couldn’t find that locomotive in the current dashboard data snapshot.”
2. Ask if it was recently added:
   - “If it was recently added, please refresh the dashboard data.”
3. Recommend a refresh call:
   - Recommend `getDashBoardData()` so the app can re-run resolution on updated data.

**If `context.dashboardDataFresh === true` (or `lastDashboardFetchAt` is recent):**
- “I still can’t find that locomotive in the dashboard database. Please re-check the locomotive number/name and try again.”

**No guessing. No “maybe it’s X”.**

---

## 8) Safety guarantees (“never hallucinate”)

The resolver must always obey:

1. **Never fabricate locomotives**
   - If not found in `assetData`, it does not exist for the bot.

2. **Never guess on ambiguity**
   - If multiple matches → disambiguate, do not auto-select.

3. **AssetId is internal only**
   - The bot may use assetId internally for recommended calls, but user-facing text should use **locomotive name** (and optionally locoNo).

4. **Prefer asking a question over picking**
   - If resolution is uncertain → `needs_followup`.

5. **Refresh recommendation is explicit and honest**
   - The bot recommends `getDashBoardData()` when the snapshot may be stale, but never claims it executed it.

---

## 9) Worked examples

> Notes:
> - “Recommended calls” are suggestions; the bot does not execute them.
> - User-facing text uses locomotive **name**, not assetId.

### Example 1 — assetId provided
**User:** “Next inspection for 68efff48b447af0013eb9da9”  
**Extracted:** `assetIds=["68efff..."] confidence=high`  
**Resolution:** Resolved (assetId exists in assetData) → present by name, e.g. “4430 SD70M”  
**Recommended calls:**
1. `getLocoNextDueLocoInspection({ assetId })`

---

### Example 2 — loco number, common phrasing
**User:** “When is 4430 due next?”  
**Extracted:** `locoNos=["4430"] confidence=medium`  
**Resolution:** Use snapshot data → if exactly 1 loco has `locoNo=4430`, resolved to name “4430 SD70M”  
**Recommended calls:**
1. `getLocoNextDueLocoInspection({ assetId })`

---

### Example 3 — explicit keyword + separator
**User:** “next inspection for loco:4430”  
**Extracted:** `locoNos=["4430"] confidence=medium`  
**Resolution:** resolved by locoNo exact match  
**Recommended calls:**
1. `getLocoNextDueLocoInspection({ assetId })`

---

### Example 4 — no-space name
**User:** “Status for 4430SD70M”  
**Extracted:** `names=["4430 SD70M"] confidence=medium`  
**Resolution:** name exact match (case-insensitive)  
**Recommended calls:**
1. `getDashBoardData()` (optional; only if intent needs broader data)
2. intent-specific call using resolved `assetId`

---

### Example 5 — year in sentence (should not resolve a loco)
**User:** “Show inspections in 2024”  
**Extracted:** likely no loco candidates; confidence low  
**Resolution:** needs_followup  
**Bot:** “Which locomotive do you mean? Please provide the locomotive number or full name.”

---

### Example 6 — compare two locos
**User:** “Compare 4430 and 8778”  
**Extracted:** `locoNos=["4430","8778"] confidence=medium`  
**Resolution:** resolve each by locoNo.  
- If both uniquely resolve → resolved list  
**Recommended calls:** depends on intent:
- If intent supports multi-loco: recommend per-loco calls.
- Otherwise ask which single locomotive to use.

---

### Example 7 — ambiguous locoNo
**User:** “Next inspection for loco 123”  
**Extracted:** `locoNos=["123"] confidence=medium`  
**Resolution:** if multiple entries share locoNo=123 → disambiguate  
**Bot:** “I found multiple locomotives matching loco 123. Which one did you mean?”  
**Options:** show 3–5 by **name**.

---

### Example 8 — not found in snapshot; suggest refresh
**User:** “Next inspection for loco 9999”  
**Extracted:** `locoNos=["9999"] confidence=medium`  
**Resolution:** 0 matches in snapshot  
**Context:** `dashboardDataFresh === false`  
**Bot:** “I couldn’t find loco 9999 in the current dashboard data snapshot.”  
**Recommended call:** `getDashBoardData()`  
**Follow-up:** “If it was recently added, refresh the data and try again.”

---

### Example 9 — user confirms refresh still missing
**User:** “I already ran getDashBoardData. Still not found.”  
**Context:** `dashboardDataFresh === true`  
**Resolution:** still 0 matches after refresh  
**Bot:** “I still can’t find that locomotive in the dashboard database. Please re-check the locomotive number/name and try again.”

---

### Example 10 — model-only token (low confidence)
**User:** “Next inspection for SD70M”  
**Extracted:** `names=["SD70M"] confidence=low`  
**Resolution:** needs_followup (don’t guess)  
**Bot:** “Which locomotive do you mean? Please provide the locomotive number or full name (e.g., 4430 SD70M).”
