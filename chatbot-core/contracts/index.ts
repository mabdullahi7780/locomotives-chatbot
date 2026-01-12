/**
 * Contracts module - shared types and validation
 */

// Re-export types inline for now (simpler setup)
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

export function validateStatusRules(response: ChatResponse): { valid: boolean; error?: string } {
  const { status, recommendedCalls } = response;
  if (status !== "answer" && recommendedCalls.length > 0) {
    return { valid: false, error: `Status "${status}" must have empty recommendedCalls` };
  }
  if (status === "needs_followup" && !response.followUpQuestion) {
    return { valid: false, error: `Status "needs_followup" should have followUpQuestion` };
  }
  if (status === "out_of_scope" && !response.outOfScopeReason) {
    return { valid: false, error: `Status "out_of_scope" should have outOfScopeReason` };
  }
  return { valid: true };
}

export function validateChatResponse(response: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!response || typeof response !== "object") {
    return { valid: false, errors: ["Response must be an object"] };
  }
  const r = response as Record<string, unknown>;
  if (typeof r.version !== "string") errors.push("version must be a string");
  if (!["answer", "needs_followup", "out_of_scope", "error"].includes(r.status as string)) {
    errors.push("status must be valid");
  }
  if (r.executionPolicy !== "suggest_only") errors.push("executionPolicy must be 'suggest_only'");
  if (typeof r.replyText !== "string") errors.push("replyText must be a string");
  if (!Array.isArray(r.recommendedCalls)) errors.push("recommendedCalls must be an array");
  return { valid: errors.length === 0, errors };
}
