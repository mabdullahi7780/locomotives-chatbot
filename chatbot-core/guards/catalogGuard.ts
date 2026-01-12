import type { ChatResponse, CallSpec } from "../contracts";

export interface FunctionCatalogJson {
  version: string;
  service?: string;
  functions: Array<{
    name: string;
    recommendable: boolean;
    readOnly: boolean;
    tags?: string[];
    aliases?: string[];
    argsSchema?: {
      type: "object";
      additionalProperties?: boolean;
      required?: string[];
      properties?: Record<string, PropertySchema>;
    };
  }>;
}

/** Property schema type for argument validation */
export interface PropertySchema {
  /** Can be a single type or array of types (e.g., ["string", "object"]) */
  type?: string | string[];
  enum?: unknown[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  /** Support oneOf for union types */
  oneOf?: PropertySchema[];
  /** Support nested object properties */
  properties?: Record<string, PropertySchema>;
  /** Support array item schema */
  items?: PropertySchema;
  /** Support required fields in nested objects */
  required?: string[];
}

type FunctionSpec = FunctionCatalogJson["functions"][number];

/** ---- Guard Configuration ---- */

export interface CatalogGuardConfig {
  catalog: FunctionCatalogJson;
  safeMode?: boolean;
  responseVersion?: string;
}

/** ---- Validation Result Types ---- */

export interface ValidationError {
  callIndex: number;
  functionName: string;
  errorType:
    | "UNKNOWN_FUNCTION"
    | "NOT_RECOMMENDABLE"
    | "NOT_READ_ONLY"
    | "MISSING_REQUIRED_ARG"
    | "EXTRA_ARG"
    | "INVALID_ARG_TYPE"
    | "MALFORMED_ARGS"
    | "UNRESOLVED_PLACEHOLDER"
    | "CONSTRAINT_VIOLATION";
  message: string;
  severity: "error" | "needs_followup" | "out_of_scope";
}

export interface GuardResult {
  valid: boolean;
  errors: ValidationError[];
  response: ChatResponse;
}

/** ---- Main Guard Class ---- */

export class CatalogGuard {
  private readonly functionIndex: Map<string, FunctionSpec>;
  private readonly safeMode: boolean;
  private readonly responseVersion: string;

  constructor(config: CatalogGuardConfig) {
    this.functionIndex = new Map();
    for (const fn of config.catalog.functions ?? []) {
      this.functionIndex.set(fn.name, fn);
    }
    this.safeMode = config.safeMode ?? true;
    this.responseVersion = config.responseVersion ?? "1.0";

    if (!this.safeMode) {
      console.warn("⚠️  CatalogGuard: safeMode disabled - write operations allowed!");
    }
  }

  guard(response: ChatResponse): GuardResult {
    try {
      return this.guardInternal(response);
    } catch (err) {
      console.error("CatalogGuard crashed during validation:", err);
      return {
        valid: false,
        errors: [{
          callIndex: -1,
          functionName: "",
          errorType: "MALFORMED_ARGS",
          message: "Internal guard error during validation",
          severity: "error",
        }],
        response: this.buildFallbackResponse(
          "error",
          "Internal error while validating the request. Please try rephrasing your question.",
          ["CatalogGuard exception: guard itself crashed, failing closed."],
        ),
      };
    }
  }

  private guardInternal(response: ChatResponse): GuardResult {
    if (response.status !== "answer") {
      if (response.recommendedCalls.length > 0) {
        return {
          valid: false,
          errors: [{
            callIndex: -1,
            functionName: "",
            errorType: "MALFORMED_ARGS",
            message: `Status "${response.status}" must have empty recommendedCalls`,
            severity: "error",
          }],
          response: this.buildFallbackResponse(
            "error",
            `Internal error: non-answer status had recommended calls.`,
            ["Schema violation: status rules require recommendedCalls=[] for non-answer status."],
          ),
        };
      }
      return { valid: true, errors: [], response };
    }

    const errors: ValidationError[] = [];

    for (let i = 0; i < response.recommendedCalls.length; i++) {
      const call = response.recommendedCalls[i];
      const callErrors = this.validateCall(call, i);
      errors.push(...callErrors);
    }

    if (errors.length > 0) {
      const errorSummary = errors.map((e) => `${e.functionName || "unknown"}: ${e.message}`).join("; ");
      const status = this.determineFallbackStatus(errors);
      const hint = this.getSafeAlternativeHint(errors);
      
      return {
        valid: false,
        errors,
        response: this.buildFallbackResponse(
          status,
          status === "needs_followup"
            ? `I need more information to complete that request. ${hint}`
            : status === "out_of_scope"
            ? `I can't help with that request. ${hint}`
            : `I can't safely recommend the requested operation. ${hint}`,
          [
            `CatalogGuard blocked: ${errorSummary}`,
            "Fail-closed strategy: returning safe fallback instead of potentially harmful recommendation.",
          ],
        ),
      };
    }

    return { valid: true, errors: [], response };
  }

  private validateCall(call: CallSpec, index: number): ValidationError[] {
    const errors: ValidationError[] = [];

    // Runtime hardening: validate call structure
    if (!call || typeof call !== "object") {
      errors.push({
        callIndex: index,
        functionName: "",
        errorType: "MALFORMED_ARGS",
        message: "Call is not a valid object",
        severity: "error",
      });
      return errors;
    }

    const { functionName, args } = call;

    // Validate functionName
    if (!functionName || typeof functionName !== "string") {
      errors.push({
        callIndex: index,
        functionName: String(functionName || ""),
        errorType: "MALFORMED_ARGS",
        message: "Function name is missing or invalid",
        severity: "error",
      });
      return errors;
    }

    // Runtime hardening: validate args structure
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      errors.push({
        callIndex: index,
        functionName,
        errorType: "MALFORMED_ARGS",
        message: `Arguments must be an object, got ${Array.isArray(args) ? "array" : typeof args}`,
        severity: "error",
      });
      return errors;
    }

    // A. Function name must exist
    const fnSpec = this.functionIndex.get(functionName);
    if (!fnSpec) {
      errors.push({
        callIndex: index,
        functionName,
        errorType: "UNKNOWN_FUNCTION",
        message: `Function "${functionName}" does not exist in the catalog`,
        severity: "out_of_scope",
      });
      return errors; // Can't validate further without spec
    }

    // B. Must be recommendable (in any mode)
    if (!fnSpec.recommendable) {
      errors.push({
        callIndex: index,
        functionName,
        errorType: "NOT_RECOMMENDABLE",
        message: `Function "${functionName}" is not recommendable (recommendable=false)`,
        severity: "out_of_scope",
      });
    }

    // B. Must be readOnly (in safe mode)
    if (this.safeMode && !fnSpec.readOnly) {
      errors.push({
        callIndex: index,
        functionName,
        errorType: "NOT_READ_ONLY",
        message: `Function "${functionName}" has side effects (readOnly=false) and is blocked in safe mode`,
        severity: "out_of_scope",
      });
    }

    // C. Args must match schema
    if (fnSpec.argsSchema) {
      const argErrors = this.validateArgs(call, fnSpec, index);
      errors.push(...argErrors);
    }

    return errors;
  }

  /**
   * Validate function arguments against the schema.
   * Enforces: required args, no extra args, type matching, AND constraint validation (minLength, pattern, etc.)
   */
  private validateArgs(call: CallSpec, fnSpec: FunctionSpec, index: number): ValidationError[] {
    const errors: ValidationError[] = [];
    const { functionName, args } = call;
    const schema = fnSpec.argsSchema;

    if (!schema) return errors;

    // Check required args
    const required = schema.required ?? [];
    for (const reqKey of required) {
      if (!(reqKey in args)) {
        errors.push({
          callIndex: index,
          functionName,
          errorType: "MISSING_REQUIRED_ARG",
          message: `Missing required argument "${reqKey}"`,
          severity: "needs_followup",
        });
      } else {
        // FIX #1: Pattern-based placeholder detection (catches <ASSET_ID>, <LOCO_ID>, etc.)
        const val = args[reqKey];
        if (typeof val === "string" && isUnresolvedPlaceholder(val)) {
          errors.push({
            callIndex: index,
            functionName,
            errorType: "UNRESOLVED_PLACEHOLDER",
            message: `Required argument "${reqKey}" has unresolved placeholder value "${val}"`,
            severity: "needs_followup",
          });
        }
      }
    }

    // Check for extra args (if additionalProperties=false)
    if (schema.additionalProperties === false && schema.properties) {
      const allowedKeys = new Set(Object.keys(schema.properties));
      for (const argKey of Object.keys(args)) {
        if (!allowedKeys.has(argKey)) {
          errors.push({
            callIndex: index,
            functionName,
            errorType: "EXTRA_ARG",
            message: `Unexpected argument "${argKey}" (not in schema)`,
            severity: "error",
          });
        }
      }
    }

    // FIX #2: Full schema validation including constraints (minLength, pattern, etc.)
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (!(key in args)) continue; // Missing args handled above

        const val = args[key];
        const validationErrors = this.validateArgValue(val, propSchema, key);
        for (const errMsg of validationErrors) {
          errors.push({
            callIndex: index,
            functionName,
            errorType: "CONSTRAINT_VIOLATION",
            message: errMsg,
            severity: "error",
          });
        }
      }
    }

    return errors;
  }

  /**
   * FIX #2: Full value validation including type AND constraints.
   * Supports: single types, type arrays, oneOf, nested objects, arrays
   */
  private validateArgValue(
    value: unknown,
    propSchema: PropertySchema,
    key: string,
  ): string[] {
    const errors: string[] = [];

    if (value === null || value === undefined) {
      return errors; // Missing values handled separately
    }

    // Handle oneOf: value must match at least one sub-schema
    if (propSchema.oneOf && propSchema.oneOf.length > 0) {
      const oneOfErrors: string[][] = [];
      let matchedAny = false;
      
      for (const subSchema of propSchema.oneOf) {
        const subErrors = this.validateArgValue(value, subSchema, key);
        if (subErrors.length === 0) {
          matchedAny = true;
          break;
        }
        oneOfErrors.push(subErrors);
      }
      
      if (!matchedAny) {
        errors.push(`Argument "${key}" does not match any of the allowed schemas (oneOf)`);
      }
      return errors;
    }

    // Check enum values
    if (propSchema.enum && !propSchema.enum.includes(value)) {
      errors.push(`Argument "${key}" value "${value}" is not in allowed enum: [${propSchema.enum.join(", ")}]`);
      return errors; // Don't check further constraints if enum fails
    }

    // Check type (supports single type or array of types)
    if (propSchema.type) {
      const actualType = getActualType(value);
      const allowedTypes = normalizeTypeArray(propSchema.type);
      
      if (!allowedTypes.includes(actualType)) {
        errors.push(`Argument "${key}" expected ${allowedTypes.join(" or ")}, got ${actualType}`);
        return errors;
      }

      // String constraints
      if (actualType === "string" && typeof value === "string") {
        if (propSchema.minLength !== undefined && value.length < propSchema.minLength) {
          errors.push(`Argument "${key}" must have at least ${propSchema.minLength} characters, got ${value.length}`);
        }
        if (propSchema.maxLength !== undefined && value.length > propSchema.maxLength) {
          errors.push(`Argument "${key}" must have at most ${propSchema.maxLength} characters, got ${value.length}`);
        }
        if (propSchema.pattern) {
          try {
            const regex = new RegExp(propSchema.pattern);
            if (!regex.test(value)) {
              errors.push(`Argument "${key}" must match pattern ${propSchema.pattern}, got "${value}"`);
            }
          } catch {
            console.warn(`Invalid pattern in schema for "${key}": ${propSchema.pattern}`);
          }
        }
      }

      // Number constraints
      if (actualType === "number" && typeof value === "number") {
        if (propSchema.minimum !== undefined && value < propSchema.minimum) {
          errors.push(`Argument "${key}" must be at least ${propSchema.minimum}, got ${value}`);
        }
        if (propSchema.maximum !== undefined && value > propSchema.maximum) {
          errors.push(`Argument "${key}" must be at most ${propSchema.maximum}, got ${value}`);
        }
      }

      // Nested object validation
      if (actualType === "object" && typeof value === "object" && !Array.isArray(value) && propSchema.properties) {
        const objValue = value as Record<string, unknown>;
        
        // Check nested required fields
        if (propSchema.required) {
          for (const reqKey of propSchema.required) {
            if (!(reqKey in objValue)) {
              errors.push(`Argument "${key}.${reqKey}" is required but missing`);
            }
          }
        }
        
        // Validate nested properties
        for (const [nestedKey, nestedSchema] of Object.entries(propSchema.properties)) {
          if (nestedKey in objValue) {
            const nestedErrors = this.validateArgValue(objValue[nestedKey], nestedSchema, `${key}.${nestedKey}`);
            errors.push(...nestedErrors);
          }
        }
      }

      // Array item validation
      if (actualType === "array" && Array.isArray(value) && propSchema.items) {
        for (let i = 0; i < value.length; i++) {
          const itemErrors = this.validateArgValue(value[i], propSchema.items, `${key}[${i}]`);
          errors.push(...itemErrors);
        }
      }
    }

    return errors;
  }

  private determineFallbackStatus(errors: ValidationError[]): "needs_followup" | "out_of_scope" | "error" {
    const hasMissingArg = errors.some((e) => e.severity === "needs_followup");
    const hasOutOfScope = errors.some((e) => e.severity === "out_of_scope");

    if (hasMissingArg) return "needs_followup";
    if (hasOutOfScope) return "out_of_scope";
    return "error";
  }

  private buildFallbackResponse(
    status: "needs_followup" | "out_of_scope" | "error",
    message: string,
    notes: string[],
  ): ChatResponse {
    const base: ChatResponse = {
      version: this.responseVersion,
      status,
      executionPolicy: "suggest_only",
      replyText: message,
      recommendedCalls: [],
      notes,
    };

    if (status === "needs_followup") {
      base.followUpQuestion = message;
    } else if (status === "out_of_scope") {
      base.outOfScopeReason = message;
    }

    return base;
  }

  private getSafeAlternativeHint(errors: ValidationError[]): string {
    const hasUnknownFunction = errors.some((e) => e.errorType === "UNKNOWN_FUNCTION");
    const hasNotReadOnly = errors.some((e) => e.errorType === "NOT_READ_ONLY");
    const hasMissingArg = errors.some((e) => e.errorType === "MISSING_REQUIRED_ARG");
    const hasPlaceholder = errors.some((e) => e.errorType === "UNRESOLVED_PLACEHOLDER");

    if (hasNotReadOnly) {
      return "That operation would modify data. Try asking to *view* the information instead.";
    }
    if (hasUnknownFunction) {
      return "Try asking about dashboard overview, inspections, out-of-service status, or locomotive details.";
    }
    if (hasMissingArg || hasPlaceholder) {
      return "Please provide the missing information (like locomotive number or assetId) and try again.";
    }
    return "Try rephrasing your question or use getDashBoardData() to explore available data.";
  }
}

/** ---- Helper Functions ---- */

function getActualType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function normalizeTypeArray(type: string | string[]): string[] {
  if (Array.isArray(type)) return type;
  return [type];
}

function isUnresolvedPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  
  if (/^<[A-Z_]+>$/.test(trimmed)) return true;
  if (/^<[a-zA-Z_]+>$/.test(trimmed)) return true;
  if (/^\$[a-zA-Z_]+$/.test(trimmed)) return true;
  
  const placeholderWords = ["placeholder", "null", "undefined", "tbd", "todo", "fixme"];
  if (placeholderWords.some((word) => trimmed.toLowerCase().includes(word))) return true;
  
  return false;
}

export function createCatalogGuard(config: CatalogGuardConfig): CatalogGuard {
  return new CatalogGuard(config);
}

export function validateAgainstCatalog(
  response: ChatResponse,
  catalog: FunctionCatalogJson,
  safeMode = true,
): { valid: boolean; errors: ValidationError[] } {
  const guard = new CatalogGuard({ catalog, safeMode });
  const result = guard.guard(response);
  return { valid: result.valid, errors: result.errors };
}
