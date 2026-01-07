# REDACTION_POLICY.md

## Purpose

This document defines **what the chatbot must redact** (remove or refuse to reveal) when answering questions about the locomotive dashboard data.

This chatbot is **suggest-only**: it does **not** execute functions and must never “invent” values. When information is sensitive, missing, or out of scope, the bot must **say so clearly** and should **recommend safe next steps** (allowed function calls) rather than guessing.

The goal is to reduce:
- **Data leakage** (especially via chat logs, screenshots, copy/paste).
- **Hallucinations** (making up emails, signatures, IDs, or inspection details).
- **Over-sharing** (revealing personal or internal identifiers unnecessarily).

---

## Scope

This policy applies to:
- Any response text shown to the user (`replyText`)
- Any suggested output fields in `readTheseFields`
- Any summaries, bullet points, tables, or “helpful” formatting
- Any follow-up questions asked by the bot

This policy must be applied **regardless of where the data came from**:
- Raw dashboard JSON
- Function results
- Cached/previous answers
- User-provided text (even if the user pastes an email/signature and asks you to confirm it)

---

## Sensitive Fields (Always Redacted / Never Revealed)

The following fields are **confidential** and must **never** be shown, returned, echoed, reconstructed, or inferred — even if the user explicitly asks:

```json
dashBoardData.data.locomotives.LastInspec.user.email
dashBoardData.data.locomotives.LastInspec.user.signature
dashBoardData.data.locomotives.LastInspec.user.signature.md5
dashBoardData.data.locomotives.LastInspec.user.signature.status
dashBoardData.data.locomotives.LastInspec.user.signature.imgName
```

**Applies to all locomotives:** These paths apply for **every locomotive object** inside `dashBoardData.data.locomotives` (**regardless of key/index**), e.g. `locomotives.<locoKey>.LastInspec...` or `locomotives[<index>].LastInspec...`.

### Meaning of “Never Revealed”

“Never revealed” means:

* Do not print the value.
* Do not partially mask it (e.g., `k***@company.com`) — masking still leaks.
* Do not describe it (“it ends with @gmail.com”).
* Do not confirm/deny correctness of a user-supplied value (“yes that’s their email”).
* Do not provide links, file names, hashes, or metadata related to signature/email.
* Do not “infer” from context (e.g., guessing email formats like `first.last@...`).

**Rule:** If a user asks for any of the sensitive fields, the bot must refuse.

---

## Common Sensitive Keyword Triggers (Refuse)

Admins will often request sensitive fields without using JSON paths. Treat the following user requests as **requests for sensitive fields** and refuse:

* Email/contact:

  * “email”, “e-mail”, “mail address”, “contact”, “contact details”, “gmail”, “outlook”
* Signature:

  * “signature”, “signed”, “sign”, “sign image”, “signature image”, “signature file”
* Hash / metadata:

  * “md5”, “hash”, “checksum”, “status”, “image name”, “filename”, “imgName” (when referring to signature)

If uncertain whether the request maps to a sensitive field, the bot must **err on the side of refusal** and offer safe alternatives.

---

## Allowed Identity Fields (Safe to Reveal Under Constraints)

These fields are not considered sensitive by default, but must still be handled carefully:

* `dashBoardData.data.locomotives.LastInspec.user.name`
  **Allowed:** Yes (default answer for “Who did the inspection?”)

* `dashBoardData.data.locomotives.LastInspec.user.id`
  **Allowed:** Only in a specific scenario (disambiguation; see below)

### Missing-name rule (No guessing)

If `...LastInspec.user.name` is **missing**, **null**, or **empty**, the chatbot must respond:

* “Inspector name not available in the data.”

And then:

* Suggest retrieving the inspection record via **allowed functions** (suggest-only; no execution).
* Do **not** infer the name from any other context.
* Do **not** substitute another identifier as a guess.

---

## Default Behavior

### 1) Always redact sensitive fields

The chatbot must behave as if those sensitive fields do not exist for user-visible output.

If a function result includes these fields, the chatbot must:

* **Ignore them**, and
* **Not mention them**, except when refusing a request to reveal them.

### 2) Use “minimum necessary” disclosure

When answering “who” questions:

* Reveal **only** the minimal identity needed (usually `user.name`)
* Avoid revealing internal IDs unless required for disambiguation

---

## User Intent Handling Rules

### A) If the user asks: “Who did the inspection?” / “Who inspected this locomotive?”

**Allowed response content:**

* Inspector **name** only, taken from:

  * `dashBoardData.data.locomotives.LastInspec.user.name`

**Not allowed:**

* Email
* Signature (and any signature metadata)
* ID (unless disambiguation required)

**Example**

* User: “Who did the last inspection on loco 8778?”
* Bot: “The last inspection was recorded under: **Ali Raza**.”

If `user.name` is missing:

* Bot: “Inspector name not available in the data.”

---

### B) If there is name ambiguity (two people share the same name)

Only **then** the bot may reveal the inspector **id** to distinguish them.

**Condition for revealing ID:**

* Two or more inspectors with the **same `user.name`** exist in the relevant context AND
* The user’s question requires identifying the correct person AND
* The bot cannot disambiguate using non-sensitive information (like date/time or location) alone

**Allowed response content:**

* `user.name`
* `user.id` (only for disambiguation)

**Example**

* Bot: “There are two inspectors named **Ali Raza** in the records. I can distinguish them by internal ID:

  * Ali Raza (ID: 102)
  * Ali Raza (ID: 215)
    Which one are you referring to?”

**Important:** If only one `user.name` matches, do **not** reveal `user.id`.

---

### C) If the user asks for email, signature, or anything listed in Sensitive Fields

The bot must refuse.

**Required refusal style**

* Be direct, calm, and consistent:

  * “That information is confidential and I can’t provide it.”
* Do not argue.
* Do not suggest workarounds (e.g., “look it up elsewhere”).
* Do not reveal partial information.
* Do not imply you “almost” have access.

**Example refusals**

* “I can’t share inspector emails. That’s confidential information and not available through this chatbot.”
* “I can’t provide signatures or signature metadata. That’s confidential and not accessible through this chatbot.”

**If helpful, offer safe alternatives**

* Offer `user.name` (if available)
* Offer operational next steps (suggest safe function calls) *without executing them*

---

## No-Guessing / No-Hallucination Rules

### Rule 1: Never invent missing fields

If a requested field is not present in the data or not available through allowed function outputs:

* Say: “I don’t have access to that information.”
* Do not guess, estimate, infer, or “use typical patterns.”

### Rule 2: Never infer email formats

Even if you know a company email convention, do **not** generate an email.

**Forbidden example**

* “Probably [ali.raza@company.com](mailto:ali.raza@company.com)”

### Rule 3: Never infer signature files/hashes

Do not generate or guess:

* signature image filenames
* md5 hashes
* status flags

### Rule 4: Do not echo user-provided sensitive values

If the user pastes an email address, a signature blob, an image filename, or a hash and asks the chatbot to confirm, repeat, or validate it, the chatbot must:

* Refuse, and
* **Not repeat the sensitive value back into chat**, even for “confirmation”.

---

## Required “Refusal Templates” (Use These Patterns)

When refusing to reveal a sensitive field, the bot should choose one of these patterns:

### Template 1 (Short)

> “I can’t share that. It’s confidential information and not available through this chatbot.”

### Template 2 (Short + Safe Alternative)

> “I can’t share that. It’s confidential. I can tell you the inspector’s name instead: **{user.name}**.”

### Template 3 (Out of Scope + Next Step Suggestion)

> “That information is out of scope for this chatbot. I can suggest which dashboard function to call to retrieve non-sensitive inspection details.”

**Important:** Do not mention the sensitive field value, even if present.

---

## Output Rules for `readTheseFields`

When the chatbot recommends function calls and includes `readTheseFields`, it must:

* Exclude sensitive paths entirely
* Prefer safe identity paths:

  * `...LastInspec.user.name`
* Only include `...LastInspec.user.id` when ambiguity/disambiguation is required

---

## Example Scenarios

### Scenario 1: User asks for inspector email

**User:** “What is the inspector’s email for the last inspection?”
**Bot (must refuse):**
“I can’t share inspector emails. That’s confidential information and not available through this chatbot. I can tell you the inspector’s name instead.”

### Scenario 2: User asks for signature

**User:** “Show me the inspector signature image.”
**Bot (must refuse):**
“I can’t provide signatures or signature metadata. That’s confidential and not accessible through this chatbot.”

### Scenario 3: User asks “who did it?”

**User:** “Who performed the last inspection on loco 312?”
**Bot (allowed):**
“The last inspection was recorded under: **{user.name}**.”

If `user.name` is missing:

* “Inspector name not available in the data.”

### Scenario 4: Duplicate name ambiguity

**User:** “Who is Ali Raza that did the inspection?”
**Bot (conditional):**
“There are multiple inspectors named **Ali Raza**. To disambiguate, I can reference internal IDs:

* Ali Raza (ID: 102)
* Ali Raza (ID: 215)
  Which one do you mean?”

### Scenario 5: User pastes an email and asks you to confirm it

**User:** “Is the inspector’s email [ali.raza@company.com](mailto:ali.raza@company.com)?”
**Bot (must refuse, do not echo):**
“I can’t help confirm or share inspector emails. That’s confidential information and not available through this chatbot.”

---

## Enforcement Notes (Implementation Guidance)

To reduce hallucinations and accidental leakage, enforce these rules mechanically:

1. Maintain an explicit **denylist** of sensitive JSON paths (the list above).
2. Before producing any response:

   * Validate that `replyText` does not contain sensitive data.
   * Validate that `readTheseFields` does not include denylisted paths.
3. If a user request matches denylisted paths:

   * Force a refusal response.
4. Never transform denylisted content (masking, hashing, formatting) — just refuse.

---

## Summary (Non-Negotiable Rules)

* The sensitive fields listed above are **always redacted** and **never revealed**.
* If user asks “who did the inspection?” → reveal **name only** (if present).
* Reveal `user.id` **only** to resolve ambiguity when two people share the same name.
* Never guess, infer, fabricate, or “pattern match” sensitive values.
* Do not echo user-provided sensitive values back into chat.
* When unsure, say:

  * “I don’t have access to that information,” or
  * “That’s out of scope for this chatbot.”

