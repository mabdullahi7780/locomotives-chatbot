/**
 * ChatResponse Contract Types
 *
 * Shared types for the chatbot response contract.
 * These should mirror contracts/chatResponse.schema.json.
 *
 * STATUS RULES (fail-closed):
 * - "answer" => recommendedCalls MUST be non-empty
 * - "needs_followup" | "out_of_scope" | "error" => recommendedCalls MUST be []
 * - "needs_followup" => followUpQuestion REQUIRED, and forbidden on other statuses
 * - "out_of_scope" => outOfScopeReason REQUIRED, and forbidden on other statuses
 * - readTheseFields => allowed only for "answer" (recommended)
 */

export type ChatStatus = "answer" | "needs_followup" | "out_of_scope" | "error";
export type ExecutionPolicy = "suggest_only";

export interface CallSpec {
  functionName: string;
  args: Record<string, unknown>;
}

export interface ChatResponse {
  version: string;
  status: ChatStatus;
  executionPolicy: ExecutionPolicy;
  replyText: string;
  recommendedCalls: CallSpec[];

  readTheseFields?: string[];
  followUpQuestion?: string;
  outOfScopeReason?: string;
  notes?: string[];
}

/** ---------- Small type guards ---------- */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** ---------- Status rules validation ---------- */

export function validateStatusRules(response: ChatResponse): { valid: boolean; error?: string } {
  const { status, recommendedCalls } = response;

  // Non-answer statuses must have no calls
  if (status !== "answer" && recommendedCalls.length > 0) {
    return {
      valid: false,
      error: `Status "${status}" must have empty recommendedCalls, but got ${recommendedCalls.length} calls`,
    };
  }

  // Answer should have at least one call in this architecture (prevents “empty confident answers”)
  if (status === "answer" && recommendedCalls.length === 0) {
    return {
      valid: false,
      error: `Status "answer" must include at least 1 recommended call (otherwise use needs_followup/out_of_scope/error)`,
    };
  }

  // needs_followup must include followUpQuestion, and only that status should include it
  if (status === "needs_followup") {
    if (!response.followUpQuestion || response.followUpQuestion.trim().length === 0) {
      return { valid: false, error: `Status "needs_followup" requires a non-empty followUpQuestion` };
    }
  } else {
    if (response.followUpQuestion !== undefined) {
      return { valid: false, error: `followUpQuestion is only allowed when status="needs_followup"` };
    }
  }

  // out_of_scope must include outOfScopeReason, and only that status should include it
  if (status === "out_of_scope") {
    if (!response.outOfScopeReason || response.outOfScopeReason.trim().length === 0) {
      return { valid: false, error: `Status "out_of_scope" requires a non-empty outOfScopeReason` };
    }
  } else {
    if (response.outOfScopeReason !== undefined) {
      return { valid: false, error: `outOfScopeReason is only allowed when status="out_of_scope"` };
    }
  }

  // readTheseFields should only appear on "answer" (recommended to avoid confusion/leakage)
  if (status !== "answer" && response.readTheseFields !== undefined) {
    return { valid: false, error: `readTheseFields is only allowed when status="answer"` };
  }

  return { valid: true };
}

/** ---------- Full validation ---------- */

export function validateChatResponse(response: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!isPlainObject(response)) {
    return { valid: false, errors: ["Response must be a plain object"] };
  }

  const r = response as Record<string, unknown>;

  // Required fields
  if (typeof r.version !== "string") errors.push("version must be a string");

  if (typeof r.status !== "string" || !["answer", "needs_followup", "out_of_scope", "error"].includes(r.status)) {
    errors.push(`status must be one of: answer, needs_followup, out_of_scope, error`);
  }

  if (r.executionPolicy !== "suggest_only") errors.push("executionPolicy must be 'suggest_only'");
  if (typeof r.replyText !== "string") errors.push("replyText must be a string");

  if (!Array.isArray(r.recommendedCalls)) {
    errors.push("recommendedCalls must be an array");
  }

  // Validate each call
  if (Array.isArray(r.recommendedCalls)) {
    for (let i = 0; i < r.recommendedCalls.length; i++) {
      const call = r.recommendedCalls[i];
      if (!isPlainObject(call)) {
        errors.push(`recommendedCalls[${i}] must be a plain object`);
        continue;
      }
      if (typeof call.functionName !== "string" || call.functionName.trim().length === 0) {
        errors.push(`recommendedCalls[${i}].functionName must be a non-empty string`);
      }
      if (!isPlainObject(call.args)) {
        errors.push(`recommendedCalls[${i}].args must be a plain object`);
      }
    }
  }

  // Optional fields
  if (r.readTheseFields !== undefined && !isStringArray(r.readTheseFields)) {
    errors.push("readTheseFields must be an array of strings if present");
  }
  if (r.followUpQuestion !== undefined && typeof r.followUpQuestion !== "string") {
    errors.push("followUpQuestion must be a string if present");
  }
  if (r.outOfScopeReason !== undefined && typeof r.outOfScopeReason !== "string") {
    errors.push("outOfScopeReason must be a string if present");
  }
  if (r.notes !== undefined && !isStringArray(r.notes)) {
    errors.push("notes must be an array of strings if present");
  }

  // Status rules
  if (errors.length === 0) {
    const statusCheck = validateStatusRules(r as ChatResponse);
    if (!statusCheck.valid && statusCheck.error) errors.push(statusCheck.error);
  }

  return { valid: errors.length === 0, errors };
}
