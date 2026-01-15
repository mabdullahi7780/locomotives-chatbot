import type { ChatResponse, CallSpec } from "../contracts";

export interface FunctionCatalogJson {
  version: string;
  functions: Array<{
    name: string;
    recommendable: boolean;
    readOnly: boolean;
    returns?: {
      readTheseFields?: string[];
    };
  }>;
}

type FunctionSpec = FunctionCatalogJson["functions"][number];

/** ---- Guard Configuration ---- */

export interface FieldGuardConfig {
  /** The function catalog (source of allowed field paths) */
  catalog: FunctionCatalogJson;
  /** Safety mode - default true, never disable in advisor mode */
  safeMode?: boolean;
  /** Allow inspector user.id for disambiguation - default false */
  allowInspectorId?: boolean;
  /** Response version for fallback responses */
  responseVersion?: string;
  /** Additional allowed field patterns (for special cases - use sparingly!) */
  additionalAllowedPatterns?: string[];
  /** Skip field validation entirely (use with caution - for testing only) */
  skipFieldValidation?: boolean;
}

/** ---- Validation Result Types ---- */

export interface FieldValidationError {
  field?: string;
  text?: string;
  errorType:
    | "SENSITIVE_FIELD"
    | "UNKNOWN_FIELD"
    | "SENSITIVE_TEXT"
    | "MALFORMED_RESPONSE"
    | "SCHEMA_VIOLATION";
  message: string;
  severity: "error" | "out_of_scope";
}

export interface FieldGuardResult {
  valid: boolean;
  errors: FieldValidationError[];
  response: ChatResponse;
}

/** ---- Denylist Patterns ---- */

/**
 * Sensitive path segments - blocked ANYWHERE in the path
 * Uses segment-based matching, not just suffix matching
 */
const SENSITIVE_SEGMENTS = new Set([
  "email",
  "emailaddress",
  "useremail",
  "signature",
  "signaturemd5",
  "signaturestatus",
  "signatureimgname",
  "imgname",
  "md5",
]);

/**
 * Sensitive path patterns - for more complex matching
 * These match anywhere in the path
 */
const SENSITIVE_PATH_PATTERNS: RegExp[] = [
  // Email anywhere in path (as a segment)
  /(^|\.)email(\.|$)/i,
  /(^|\.)emailaddress(\.|$)/i,

  // Signature anywhere in path (as a segment or prefix)
  /(^|\.)signature(\.|$)/i,
  /(^|\.)signature\./i,

  // User sub-fields that are sensitive
  /\.user\.email/i,
  /\.user\.signature/i,

  // LastInspec sensitive fields
  /lastinspec\.user\.email/i,
  /lastinspec\.user\.signature/i,

  // Any signature metadata
  /signature\.md5/i,
  /signature\.status/i,
  /signature\.imgname/i,
];

/**
 * User ID patterns (blocked unless allowInspectorId=true)
 */
const USER_ID_PATTERNS: RegExp[] = [
  /(^|\.)user\.id(\.|$)/i,
  /(^|\.)user\._id(\.|$)/i,
  /lastinspec\.user\.id/i,
  /lastinspec\.user\._id/i,
];

/**
 * Words that should never appear in output text
 */
const FORBIDDEN_TEXT_KEYWORDS = [
  "user.email",
  "user.signature",
  "signature.md5",
  "signature.status",
  "signature.imgname",
];

/** ---- Main Guard Class ---- */

export class FieldGuard {
  private readonly functionIndex: Map<string, FunctionSpec>;
  private readonly safeMode: boolean;
  private readonly allowInspectorId: boolean;
  private readonly responseVersion: string;
  private readonly additionalAllowedPatterns: string[];
  private readonly skipFieldValidation: boolean;

  constructor(config: FieldGuardConfig) {
    this.functionIndex = new Map();
    for (const fn of config.catalog.functions ?? []) {
      this.functionIndex.set(fn.name, fn);
    }
    this.safeMode = config.safeMode ?? true;
    this.allowInspectorId = config.allowInspectorId ?? false;
    this.responseVersion = config.responseVersion ?? "1.0";
    this.additionalAllowedPatterns = config.additionalAllowedPatterns ?? [];
    this.skipFieldValidation = config.skipFieldValidation ?? false;

    if (!this.safeMode) {
      console.warn("⚠️  FieldGuard: safeMode disabled!");
    }

    // Warn if additional patterns look too broad
    for (const pattern of this.additionalAllowedPatterns) {
      if (pattern.endsWith(".*") || pattern.endsWith("*")) {
        console.warn(
          `⚠️  FieldGuard: broad pattern "${pattern}" may allow hallucinated fields`
        );
      }
    }
  }

  /**
   * Validate and guard a ChatResponse.
   * Returns the original response if valid, or a safe fallback if invalid.
   * This function NEVER throws.
   */
  guard(response: ChatResponse): FieldGuardResult {
    try {
      return this.guardInternal(response);
    } catch (err) {
      console.error("FieldGuard crashed during validation:", err);
      return {
        valid: false,
        errors: [
          {
            errorType: "MALFORMED_RESPONSE",
            message: "Internal guard error during field validation",
            severity: "error",
          },
        ],
        response: this.buildFallbackResponse(
          "error",
          "Internal error while validating the response. Please try rephrasing your question.",
          ["FieldGuard exception: guard crashed, failing closed."]
        ),
      };
    }
  }

  private guardInternal(response: ChatResponse): FieldGuardResult {
    const errors: FieldValidationError[] = [];

    // 1. Validate text fields for sensitive data leakage (always, regardless of status)
    const textErrors = this.validateTextFields(response);
    errors.push(...textErrors);

    // 2. FIX #2: Validate readTheseFields WHENEVER it exists
    if (response.readTheseFields && response.readTheseFields.length > 0) {
      // If status is NOT "answer", having readTheseFields is a schema violation
      if (response.status !== "answer") {
        errors.push({
          errorType: "SCHEMA_VIOLATION",
          message: `Status "${response.status}" must not have readTheseFields (found ${response.readTheseFields.length} fields)`,
          severity: "error",
        });
      } else {
        // Status is "answer" - validate fields against allowlist
        const fieldErrors = this.validateReadTheseFields(
          response.readTheseFields,
          response.recommendedCalls
        );
        errors.push(...fieldErrors);
      }
    }

    // If any errors, return appropriate fallback
    if (errors.length > 0) {
      const hasSensitive = errors.some(
        (e) =>
          e.errorType === "SENSITIVE_FIELD" || e.errorType === "SENSITIVE_TEXT"
      );
      const status = hasSensitive ? "out_of_scope" : "error";

      const errorSummary = errors.map((e) => e.message).join("; ");
      const hint = this.getSafeAlternativeHint(errors);

      return {
        valid: false,
        errors,
        response: this.buildFallbackResponse(
          status,
          hasSensitive
            ? `I can't provide that information. ${hint}`
            : `I can't safely interpret those fields. ${hint}`,
          [
            `FieldGuard blocked: ${errorSummary}`,
            "Fail-closed strategy: refusing to expose potentially sensitive data.",
          ]
        ),
      };
    }

    return { valid: true, errors: [], response };
  }

  /**
   * Validate readTheseFields against allowlist from catalog
   */
  private validateReadTheseFields(
    fields: string[],
    recommendedCalls: CallSpec[]
  ): FieldValidationError[] {
    const errors: FieldValidationError[] = [];

    const allowedPatterns =
      this.compileAllowedPatternsFromCalls(recommendedCalls);

    for (const field of fields) {
      if (typeof field !== "string") {
        errors.push({
          errorType: "SCHEMA_VIOLATION",
          message: `readTheseFields contains a non-string entry`,
          severity: "error",
        });
        continue;
      }

      const trimmedField = field.trim();
      if (!trimmedField) continue;

      // 1. Check denylist FIRST (absolute block)
      if (this.isDenied(trimmedField)) {
        errors.push({
          field: trimmedField,
          errorType: "SENSITIVE_FIELD",
          message: `Field "${trimmedField}" contains sensitive data (email/signature) and cannot be exposed`,
          severity: "out_of_scope",
        });
        continue;
      }

      // 2. Check user.id (conditionally blocked)
      if (!this.allowInspectorId && this.isUserIdField(trimmedField)) {
        errors.push({
          field: trimmedField,
          errorType: "SENSITIVE_FIELD",
          message: `Field "${trimmedField}" (user ID) is blocked unless explicitly allowed for disambiguation`,
          severity: "out_of_scope",
        });
        continue;
      }

      // 3. Check allowlist from catalog
      if (!this.matchesAllowedPattern(trimmedField, allowedPatterns)) {
        errors.push({
          field: trimmedField,
          errorType: "UNKNOWN_FIELD",
          message: `Field "${trimmedField}" is not in the allowed fields for the recommended function(s)`,
          severity: "error",
        });
      }
    }

    return errors;
  }

  /**
   * Validate text fields for sensitive data leakage
   */
  private validateTextFields(response: ChatResponse): FieldValidationError[] {
    const errors: FieldValidationError[] = [];

    // Fields to scan
    const textFields: Array<{ name: string; value: string | undefined }> = [
      { name: "replyText", value: response.replyText },
      { name: "followUpQuestion", value: response.followUpQuestion },
      { name: "outOfScopeReason", value: response.outOfScopeReason },
    ];

    // Also scan notes if present
    if (response.notes) {
      for (let i = 0; i < response.notes.length; i++) {
        textFields.push({ name: `notes[${i}]`, value: response.notes[i] });
      }
    }

    for (const { name, value } of textFields) {
      if (!value || typeof value !== "string") continue;

      const sensitiveMatch = this.containsSensitiveText(value);
      if (sensitiveMatch) {
        errors.push({
          text: name,
          errorType: "SENSITIVE_TEXT",
          message: `Field "${name}" contains sensitive data: ${sensitiveMatch}`,
          severity: "out_of_scope",
        });
      }
    }

    return errors;
  }

  /**
   * Compile allowed patterns from the recommended calls
   * FIX #1: NO broad wildcards - only explicit patterns from catalog
   */
  private compileAllowedPatternsFromCalls(calls: CallSpec[]): string[] {
    const patterns: Set<string> = new Set();

    // Add additional allowed patterns (should be specific, not broad)
    for (const pattern of this.additionalAllowedPatterns) {
      patterns.add(pattern);
    }

    // Add patterns from each recommended function
    for (const call of calls) {
      if (!call || typeof call.functionName !== "string") continue;

      const fnSpec = this.functionIndex.get(call.functionName);
      if (!fnSpec) continue;

      const allowedFields = fnSpec.returns?.readTheseFields ?? [];
      for (const field of allowedFields) {
        patterns.add(field);
      }
    }

    // NO BROAD WILDCARDS! The catalog is the single source of truth.
    // If you need value.summary.* or value.assetData.*, add them to
    // getDashBoardData.returns.readTheseFields in FUNCTION_CATALOG.json

    return Array.from(patterns);
  }

  /**
   * Check if a field path matches any allowed pattern
   * FIX #4: Simple segment-based matching instead of complex regex
   */
  private matchesAllowedPattern(
    fieldPath: string,
    allowedPatterns: string[]
  ): boolean {
    const normalizedPath = fieldPath.toLowerCase();

    const pathSegments = this.parsePatternSegments(normalizedPath);

    for (const pattern of allowedPatterns) {
      if (this.segmentPatternMatches(pathSegments, pattern.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  /**
   * FIX #4: Segment-based pattern matching (simpler and safer than regex)
   *
   * Pattern rules:
   * - Exact segment: matches only that segment
   * - <anything>: matches any single segment (wildcard for dynamic IDs)
   * - *: at the end only, matches any remaining segments
   * - []: matches array index segment like [0], [1], etc.
   */
  private segmentPatternMatches(
    pathSegments: string[],
    pattern: string
  ): boolean {
    const patternSegments = this.parsePatternSegments(pattern);

    let pathIdx = 0;
    let patternIdx = 0;

    while (patternIdx < patternSegments.length) {
      const patternSeg = patternSegments[patternIdx];

      // Wildcard "*" at end matches everything remaining
      if (patternSeg === "*") {
        // * must be the last segment
        if (patternIdx === patternSegments.length - 1) {
          return true; // Matches any remaining path
        }
        return false; // * in the middle is invalid
      }

      // No more path segments but pattern continues
      if (pathIdx >= pathSegments.length) {
        return false;
      }

      const pathSeg = pathSegments[pathIdx];

      // Check segment match
      if (!this.segmentMatches(pathSeg, patternSeg)) {
        return false;
      }

      pathIdx++;
      patternIdx++;
    }

    // Both must be exhausted for exact match (unless pattern ended with *)
    return pathIdx === pathSegments.length;
  }

  /**
   * Parse pattern into segments, handling special cases
   */
  private parsePatternSegments(pattern: string): string[] {
    const segments: string[] = [];
    let current = "";
    let inBracket = false;

    for (let i = 0; i < pattern.length; i++) {
      const char = pattern[i];

      if (char === "<") {
        inBracket = true;
        current += char;
      } else if (char === ">") {
        inBracket = false;
        current += char;
      } else if (char === "[") {
        // Handle array notation
        if (current) {
          segments.push(current);
          current = "";
        }
        // Read until ]
        let arrayPart = "[";
        i++;
        while (i < pattern.length && pattern[i] !== "]") {
          arrayPart += pattern[i];
          i++;
        }
        arrayPart += "]";
        segments.push(arrayPart);
      } else if (char === "." && !inBracket) {
        if (current) {
          segments.push(current);
          current = "";
        }
      } else {
        current += char;
      }
    }

    if (current) {
      segments.push(current);
    }

    return segments;
  }

  /**
   * Check if a single path segment matches a pattern segment
   */
  private segmentMatches(pathSeg: string, patternSeg: string): boolean {
    // Exact match
    if (pathSeg === patternSeg) return true;

    // Segment-level wildcard (e.g., *_id)
    if (patternSeg.includes("*") && patternSeg !== "*") {
      const escaped = patternSeg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`^${escaped.replace(/\\\*/g, ".*")}$`);
      return regex.test(pathSeg);
    }

    // <anything> wildcard matches any single segment
    if (patternSeg.startsWith("<") && patternSeg.endsWith(">")) {
      return true;
    }

    // [] matches any array index [0], [1], [123], etc.
    if (patternSeg === "[]") {
      return /^\[\d+\]$/.test(pathSeg);
    }

    return false;
  }

  /**
   * Check if field is on the absolute denylist (email/signature)
   * FIX #3: Segment-based matching to catch email/signature anywhere
   */
  private isDenied(fieldPath: string): boolean {
    const lowerPath = fieldPath.toLowerCase();

    // Check sensitive path patterns
    for (const pattern of SENSITIVE_PATH_PATTERNS) {
      if (pattern.test(lowerPath)) {
        return true;
      }
    }

    // Check if any segment is a sensitive keyword
    const segments = lowerPath.split(/[.\[\]]+/).filter(Boolean);
    for (const segment of segments) {
      if (SENSITIVE_SEGMENTS.has(segment)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if field is a user ID field (conditionally blocked)
   */
  private isUserIdField(fieldPath: string): boolean {
    const lowerPath = fieldPath.toLowerCase();
    for (const pattern of USER_ID_PATTERNS) {
      if (pattern.test(lowerPath)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if text contains sensitive data (email, signature, etc.)
   * Returns description of what was found, or null if clean
   */
  private containsSensitiveText(text: string): string | null {
    // Check for email addresses
    const emailMatch = text.match(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
    );
    if (emailMatch) {
      return `email address detected`;
    }

    // Check for base64 image data (potential signature)
    if (/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]{100,}/.test(text)) {
      return `base64 image data detected (potential signature)`;
    }

    // Check for MD5 hashes (32 hex chars) with context suggesting signature
    if (/signature.*[a-f0-9]{32}|[a-f0-9]{32}.*signature/i.test(text)) {
      return `MD5 hash in signature context detected`;
    }

    // Check for forbidden keywords
    const lowerText = text.toLowerCase();
    for (const keyword of FORBIDDEN_TEXT_KEYWORDS) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return `forbidden keyword "${keyword}" detected`;
      }
    }

    // Check for field path patterns that shouldn't be in user-facing text
    if (/lastinspec\.user\.(email|signature)/i.test(text)) {
      return `sensitive field path in text`;
    }

    // Check for any .email or .signature patterns in text
    if (/(^|\s|\.)email(\s|$|\.)/i.test(text) && /@/.test(text)) {
      return `email reference with @ sign detected`;
    }

    return null;
  }

  /**
   * Build a safe fallback response
   */
  private buildFallbackResponse(
    status: "out_of_scope" | "error",
    message: string,
    notes: string[]
  ): ChatResponse {
    const base: ChatResponse = {
      version: this.responseVersion,
      status,
      executionPolicy: "suggest_only",
      replyText: message,
      recommendedCalls: [], // MUST be empty for non-answer status
      notes,
    };

    if (status === "out_of_scope") {
      base.outOfScopeReason = message;
    }

    return base;
  }

  /**
   * Get hint for safe alternatives based on errors
   */
  private getSafeAlternativeHint(errors: FieldValidationError[]): string {
    const hasSensitiveField = errors.some(
      (e) => e.errorType === "SENSITIVE_FIELD"
    );
    const hasSensitiveText = errors.some(
      (e) => e.errorType === "SENSITIVE_TEXT"
    );
    const hasUnknownField = errors.some((e) => e.errorType === "UNKNOWN_FIELD");
    const hasSchemaViolation = errors.some(
      (e) => e.errorType === "SCHEMA_VIOLATION"
    );

    if (hasSensitiveField || hasSensitiveText) {
      return 'Inspector emails and signatures are always redacted. Try asking "Who did the last inspection?" (inspector name is allowed).';
    }
    if (hasUnknownField) {
      return "That field doesn't exist in the dashboard data. Try asking about standard fields like inspection status, due dates, or locomotive details.";
    }
    if (hasSchemaViolation) {
      return "There was an internal error with the response format. Please try again.";
    }
    return "Try rephrasing your question using standard dashboard fields.";
  }
}

/** ---- Convenience Factory ---- */

export function createFieldGuard(config: FieldGuardConfig): FieldGuard {
  return new FieldGuard(config);
}

/** ---- Standalone Validation Function ---- */

export function validateFieldsAgainstCatalog(
  response: ChatResponse,
  catalog: FunctionCatalogJson,
  options?: { allowInspectorId?: boolean }
): { valid: boolean; errors: FieldValidationError[] } {
  const guard = new FieldGuard({
    catalog,
    safeMode: true,
    allowInspectorId: options?.allowInspectorId ?? false,
  });
  const result = guard.guard(response);
  return { valid: result.valid, errors: result.errors };
}
