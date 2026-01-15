# UPDATED_PIPELINE.md — Hybrid Intent Routing (Rule + RAG) with CAG Token Savings

## 0) Purpose

This document describes the **updated end-to-end pipeline** for the locomotive dashboard chatbot after Step 9+ of the plan.

The goal is to combine:

- **Rule-based intent routing** (fast, deterministic baseline from Steps 6–8)
- **RAG-style semantic retrieval** (embeddings-based "meaning search" over vetted docs)
- **CAG-style token reduction** (keep large static context out of prompts by caching/compiling)

…and still preserve the core safety invariant:

> The chatbot is **suggest-only**.  
> It **never executes** functions.  
> It only **recommends** approved, read-only calls and tells the UI which fields to read.

---

## 1) Core artifacts from Steps 1–8 (what the pipeline depends on)

These are the "ground truth" inputs the pipeline must rely on.

### 1.1 Vetted documentation (source-of-truth)

- `docs/DATA_DICTIONARY.md`  
  The dashboard data shape and key fields admins ask about.
- `docs/FUNCTION_CATALOG.json` (+ optional readable MD)  
  **Only** allowed functions, their safety status, and safe fields.
- `docs/QUESTION_TO_FUNCTION_MAP.md`  
  Human-readable mapping: **admin questions → intent → recommended adapter call(s) → read fields → follow-up question**.
- `docs/SAFETY_RULES.md` + `docs/REDACTION_POLICY.md`  
  Non-negotiable refusal and field redaction behavior.

### 1.2 Core runtime components

- `extractLocoQuery.ts`  
  Extracts locomotive identifiers (loco number/name/assetId candidates) from user text.
- `ruleBasedRecommender.ts`  
  Deterministic baseline: keyword/synonym scoring → intent candidate(s) → suggested calls (no LLM).
- `catalogGuard.ts`  
  Blocks unknown/non-catalog functions and disallowed argument patterns.
- `fieldGuard.ts`  
  Ensures `readTheseFields[]` contains only safe, allowed field paths.
- `contracts/chatResponse.schema.json`  
  Strict JSON response contract for UI rendering.

---

## 2) What changes in Step 9+ (the "hybrid" part)

Steps 1–8 already give you a safe deterministic bot.
Step 9 adds **semantic retrieval** so the bot can handle paraphrases better (without guessing).

### 2.1 RAG in this project (what "RAG" means here)

RAG (Retrieval-Augmented Generation) here does **not** mean "answer from a knowledge base."
It means:

> Retrieve the **most relevant intent specs / examples / mappings** from *your own vetted docs*  
> and use them to **choose the correct intent and the correct safe function recommendation**.

Your retrieval corpus is:

- intent summaries + example questions (from `intentCatalog.ts`)
- per-intent blocks from `docs/QUESTION_TO_FUNCTION_MAP.md`
- (optional) safe function "cards" from `docs/FUNCTION_CATALOG.json`

This is "tool-RAG": retrieval is used to **ground the decision** of *which tool/function to recommend*.

### 2.2 CAG in this project (how we reduce tokens)

CAG (Cache/Compiled Augmented Generation) here means:

- **Compile** big static docs into short "cards" once (offline)
- **Cache** them locally so you don't keep re-sending large text to a model
- **Retrieve only tiny snippets** when needed

Even if you later add an LLM (Step 10), you keep token usage low by:

- passing **only** the top retrieved intent snippets
- never dumping full catalogs into prompts
- reusing cached "prefix context" and schema instructions

---

## 3) High-level architecture (mental model)

```text
User message
|
v
[Safety prefilter + Redaction policy]
|
v
[Entity extraction: extractLocoQuery]
|
+----------------------+
|                      |
v                      v
[Rule-based intent rank]  [Embedding retrieval (RAG)]
|                      |
+----------+-----------+
           v
[Fusion + confidence gating]
|
v
[Resolve loco assetId using snapshot]
|
v
[Build recommendedCalls + readTheseFields]
|
v
[catalogGuard + fieldGuard + schema validation]
|
v
ChatResponse JSON (suggest-only)
```

---

## 4) Detailed runtime pipeline (step-by-step)

### Step 0 — Boot-time initialization (startup, once)

Load and cache these in memory:

- `FUNCTION_CATALOG.json` (for guard checks)
- allowed `readTheseFields` patterns (field guard)
- intent catalog (rules + examples)
- embedding index (`embeddingIndex.json`)
- embedding model (MiniLM) **loaded once** (avoid per-request startup cost)

This is critical for latency.

---

### Step 1 — Receive user input + context

Inputs:

- `userText` (string)
- `context` (object passed by app), commonly including:
  - `dashboardSnapshot` (result of last `getDashBoardData()` call, if available)
  - `dashboardDataFresh` or `lastDashboardFetchAt` (boolean/timestamp)
  - any user/session metadata (non-sensitive)

Rule: the bot must **not pretend** it ran any function. It can only suggest next steps.

---

### Step 2 — Safety prefilter (fast refusal gate)

Before any intent matching:

- Check for disallowed requests (sensitive data, credentials, private identifiers, "do an update", "change status", etc.)
- Apply redaction rules
- If the request is clearly unsafe or unsupported:
  - return `out_of_scope` or `error` with a short explanation
  - `recommendedCalls` must be `[]`

This prevents the system from "trying too hard" on unsafe prompts.

---

### Step 3 — Normalize the query

Normalize text for consistent matching:

- trim, lowercase (or consistent casing strategy)
- normalize whitespace
- optionally strip punctuation noise

Keep the original text for UI display if needed.

---

### Step 4 — Entity extraction: locomotive candidates

Run `extractLocoQuery(userText)` to pull:

- loco number(s)
- loco name(s)
- possible `assetId`
- ambiguous patterns (e.g., "4430", "SD70M", "unit 12")

Output:

- `locoCandidates[]`
- `needsLoco` is not decided here; it depends on the intent.

---

### Step 5 — Rule-based intent scoring (baseline)

Run your existing rule-based matcher (fast, deterministic):

- score intents based on:
  - keywords ("due", "expiry", "next", "inspection")
  - synonyms (from `triggerPhrases`)
  - pattern hints ("out of use", "credit", "non-compliant")
- produce a shortlist:
  - `ruleTop1`, `ruleTop2` with scores
- compute confidence:
  - absolute score threshold
  - margin over second place

This is cheap and handles domain tokens/IDs well.

---

### Step 6 — Embeddings retrieval (RAG module)

Run semantic retrieval over your **vetted docs index**:

1. Embed the user query into a vector (MiniLM, 384 dims)
1. Compute similarity against all stored vectors in `embeddingIndex.json`
1. Return top-K hits with:
   - `score`
   - `intentId` (if present)
   - `source` ("intent_example", "question_map", etc.)
   - small snippet metadata (optional)

Important heuristics:

- If query is "mostly an ID" (e.g., just `4430`), embeddings can be noisy.
  - In that case, skip embeddings retrieval and rely on entity logic + rule-based routing.

---

### Step 7 — Fusion: combine rule-based + retrieval candidates

Create a final candidate set:

- include rule-based top intents
- include embedding top intents (mapped from docs → intentId)
- merge by intentId

Scoring strategy (simple + effective):

- Start with rule-based score (normalized)
- Add embedding similarity score (normalized)
- Add an "agreement boost" if both methods rank the same intent highly

Decision rules:

- If final top intent has strong lead → proceed
- If ambiguous (top two are close) → return `needs_followup`
- If nothing clears thresholds → return `out_of_scope`

This is where hallucinations are prevented:

> When uncertain, **ask one follow-up**. Do not guess.

---

### Step 8 — Determine if a locomotive is required

From the chosen intent spec:

- if `requiresLoco = true` and no resolved loco exists:
  - return `needs_followup`
  - ask exactly **one** question (e.g., "Which locomotive (number/name/assetId)?")

If user claims they refreshed:

- use `context.dashboardDataFresh`:
  - if `false` and loco not found → recommend `getDashBoardData()`
  - if `true` and still not found → say it may not exist / ask to re-check identifier

---

### Step 9 — Resolve locomotive → assetId (grounding)

If a loco is required:

- search `context.dashboardSnapshot` for a match:
  - exact numeric match (locoNo)
  - normalized name match
  - explicit assetId match
- if multiple matches:
  - return `needs_followup` with a single disambiguation question

If no snapshot is present:

- recommend calling `getDashBoardData()` (suggest-only)
- return `needs_followup` (or `answer` with "run this first" depending on your UX preference)

---

### Step 10 — Build recommended calls + read fields (still deterministic)

Using `QUESTION_TO_FUNCTION_MAP.md` and the chosen intent:

- build `recommendedCalls[]` in adapter format
- fill `args` only with:
  - resolved `assetId`
  - intent-specific safe parameters
- set `readTheseFields[]` for UI rendering

If intent supports multiple calls:

- order them so the UI can run them in a sensible sequence

---

### Step 11 — Guards (hard safety enforcement)

Run guards **after** building recommendations:

1. **Catalog guard**

- verify function exists in `FUNCTION_CATALOG.json`
- verify `recommendable === true` and `readOnly === true`
- verify args schema matches allowed keys

1. **Field guard**

- verify `readTheseFields[]` are allowed
- remove or replace invalid fields with safe fallbacks
- if too much is invalid → return `error` or `needs_followup` rather than lying

This is your "seatbelt + airbag" layer.

---

### Step 12 — Response shaping (ChatResponse contract)

Return a strict JSON object:

- `status`:
  - `answer` → you have a confident recommendation
  - `needs_followup` → missing loco / ambiguity / missing snapshot
  - `out_of_scope` → unsupported request
  - `error` → internal failures (schema mismatch, unexpected index format, etc.)
- `recommendedCalls`:
  - must be empty unless `status === "answer"`
- `replyText`:
  - short, coherent, admin-friendly
  - never claims execution
- `readTheseFields`:
  - only safe paths

---

## 5) Optional Step 10 — LLM layer (only if you add it)

If you add an LLM for better language in `replyText` (not required for correctness):

### 5.1 What the LLM is allowed to do

- Turn structured facts into a nice explanation
- Choose among already-prepared intent candidates when ambiguous (arbiter role)

### 5.2 What the LLM is NOT allowed to do

- Invent new functions
- Invent new fields to read
- Claim it executed anything

### 5.3 Token-minimizing prompt design (CAG + RAG together)

To keep tokens low:

- **CAG:** keep a cached prompt prefix containing:
  - "suggest-only" rules
  - schema contract
  - refusal rules
- **RAG:** include only:
  - top 2–4 retrieved intent snippets (very short)
  - the top rule-based candidates (ids + scores)
  - the resolved loco context (assetId if available)
- Output must be valid ChatResponse JSON

After LLM output:

- validate against schema
- re-run catalogGuard + fieldGuard (never trust model output blindly)

---

## 6) RAG module implementation notes (what you already built)

### 6.1 Offline build step: `buildEmbeddingIndex.ts`

Creates `embeddingIndex.json` by embedding:

- intent summaries
- intent examples
- question-map sections
- optional function catalog summaries

### 6.2 Runtime query step: `queryEmbeddingIndex.ts`

Loads:

- `embeddingIndex.json` (cached)
- embedding model (cached)

Then:

- embeds the user query
- returns top-K hits by similarity

---

## 7) CAG strategies that actually reduce tokens (practical)

Even without a paid LLM, CAG still helps performance and cleanliness:

### 7.1 Cache heavy, static things

- embedding model loaded once
- embedding index loaded once
- function catalog loaded once
- compiled "intent cards" pre-built (short strings)

### 7.2 Compile docs into "cards" (don't pass raw docs around)

Instead of passing full markdown sections to an LLM later, store:

- `intentId`
- `requiresLoco`
- `recommendedCalls` function names
- `readTheseFields`
- a 1–2 sentence description
- 3–8 example questions

That's enough signal, and it's tiny.

### 7.3 Cache query embeddings (optional micro-optimization)

For repeated queries (admins often repeat):

- cache `(normalizedQuery → queryVector)` for a short TTL (e.g., 5–30 minutes)

---

## 8) Failure modes (and what to do instead of hallucinating)

### 8.1 Missing locomotive

- `needs_followup`: ask exactly one loco identifier question

### 8.2 Ambiguous intent

- `needs_followup`: ask which of 2–3 meanings they intended

### 8.3 Snapshot missing / stale

- recommend `getDashBoardData()`
- explain why ("I need the latest snapshot to resolve assetId")

### 8.4 Guards block output

- return `error` or safe fallback
- never "best guess" a function or field

---

## 9) Testing expectations (what "done" looks like)

Minimum tests:

- golden questions → golden outputs snapshots
- "no unknown functions" test
- redaction tests ("email never leaks by default")
- ambiguity tests (two intents close → follow-up)
- missing loco tests (requires loco → follow-up)

---

## 10) Summary (the updated pipeline in one sentence)

**Rule-based routing gives a deterministic baseline; RAG retrieval improves paraphrase matching; CAG keeps static context compiled/cached so the system stays fast and low-token—while guards enforce zero invented tools and safe field reads.**
