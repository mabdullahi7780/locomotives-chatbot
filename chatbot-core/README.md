# Dashboard Advisor Chatbot (suggest-only)

This chatbot is a **suggest-only assistant** for the locomotive dashboard.

It takes a user's natural language question and returns **next steps** the user (or UI) can take using functions from `liteDashboardService.js`.

✅ It **recommends** which function(s) to call and what parameters to pass.  
❌ It **never executes** any function itself.

---

## What the bot does

For every user question, the bot produces a JSON response that follows a strict format defined in:

- `contracts/chatResponse.schema.json`

That JSON response contains:

- `replyText`: a friendly message to show in the chat UI
- `status`: one of `answer`, `needs_followup`, `out_of_scope`, `error`
- `recommendedCalls`: an array of function calls the user/app can run
- `readTheseFields` (optional): what fields to read from the function result
- `followUpQuestion` (only when `status = needs_followup`)
- `outOfScopeReason` (only when `status = out_of_scope`)

---

## Key rules

### 1) Suggest-only (no execution)
The bot **must not execute** any functions.  
It only suggests calls from `liteDashboardService.js` and explains how to interpret results.

### 2) Only dashboard-related help
The bot answers questions that can be solved using `liteDashboardService.js` data/functions.

If a user asks something unrelated, the bot returns:

- `status: "out_of_scope"`
- no recommended calls
- a polite explanation

### 3) Ask follow-up questions when required
If the user’s question is missing required context (example: locomotive id / asset id), the bot returns:

- `status: "needs_followup"`
- a single clear `followUpQuestion`
- no recommended calls

---

## Examples

### Example A — next inspection due (locomotive is known)
User: **"When is the next inspection due for assetId 123?"**

Bot response (example):
```json
{
  "version": "1.0",
  "status": "answer",
  "executionPolicy": "suggest_only",
  "replyText": "To find the next inspection due, call getLocoNextDueLocoInspection with the assetId.",
  "recommendedCalls": [
    {
      "functionName": "getLocoNextDueLocoInspection",
      "args": { "assetId": "123" },
      "reason": "Returns the next due inspection information for that locomotive."
    }
  ],
  "readTheseFields": ["dueInspectionDate", "inspectionType", "status"]
}

### Example B — next inspection due (locomotive is not known)
User: **"When is the next inspection due?"**

Bot response (example):
```json
{
  "version": "1.0",
  "status": "needs_followup",
  "executionPolicy": "suggest_only",
  "replyText": "I can help, but I need to know which locomotive you mean.",
  "recommendedCalls": [],
  "followUpQuestion": "Which locomotive (assetId or locoId) are you asking about?"
}

### Example C — suggesting an update (still not executing)

User: "Mark locomotive L-10 as out of service."

Bot response (example):
```json
{
  "version": "1.0",
  "status": "answer",
  "executionPolicy": "suggest_only",
  "replyText": "To update the dashboard state, call updateDashBoardLocoState with the locomotive id.",
  "recommendedCalls": [
    {
      "functionName": "updateDashBoardLocoState",
      "args": { "locoId": "L-10" },
      "reason": "Updates the dashboard state for the specified locomotive."
    }
  ]
}

### Example D — out of scope question
User: **"Who own the World Cup?"**

Bot response (example):
```json
{
  "version": "1.0",
  "status": "out_of_scope",
  "executionPolicy": "suggest_only",
  "replyText": "I’m designed to answer questions only about locomotive dashboard data and functions in liteDashboardService.js.",
  "recommendedCalls": [],
  "outOfScopeReason": "The question is not related to the dashboard service or its data."
}

## Non-goals (things this bot will NOT do)

- It will not execute service functions or run database calls.
- It will not directly modify dashboard data by itself.
- It will not answer unrelated general knowledge questions.
- It will not invent function names outside `liteDashboardService.js`.

## Integration note

This chatbot is designed to be plug-and-play:

- The core logic should not depend on React.
- The UI widget should render `replyText` and optionally render buttons for `recommendedCalls`.
- The host dashboard decides whether to actually execute any suggested call.
- The host dashboard can supply a context window (example: selected locomotive) to improve accuracy and reduce follow-up questions.
