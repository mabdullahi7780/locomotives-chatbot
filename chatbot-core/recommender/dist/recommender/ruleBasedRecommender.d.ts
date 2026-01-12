/**
 * ruleBasedRecommender.ts
 *
 * Deterministic (non-LLM) recommender that:
 * - Routes a user question -> best Intent (lexical rules)
 * - Extracts locomotive identifiers (assetId / locoNo / name)
 * - Resolves locoNo/name -> assetId using a provided dashboard snapshot (dashBoardDataJSON.js)
 * - Enforces the 3-step flow:
 *    1) Try map locoNo/name -> assetId from snapshot
 *    2) If not found and NOT fresh -> recommend getDashBoardData() (refresh) and STOP
 *    3) If fresh + still not found -> tell user we don't have that loco (echo input), ask to re-check
 * - Returns a ChatResponse that matches contracts/chatResponse.schema.json
 *
 * SAFETY:
 * - Suggest-only: NEVER execute anything, never claim execution.
 * - Catalog-only: recommend ONLY functions that are recommendable:true in FUNCTION_CATALOG.json.
 * - Redaction: refuse requests for inspector email/signature/MD5/imgName; never include redacted fields in readTheseFields.
 * - needs_followup/out_of_scope/error MUST return recommendedCalls: [] (schema rule).
 *
 * "Project plugin-able":
 * - This file does NOT import or call liteDashboardService directly.
 * - You inject your intent catalog + function catalog + (optional) snapshot resolver.
 */
import { type LocoQuery } from "./../nlp/extractLocoQuery";
/** ---- Intent types (define locally since not exported from intentCatalog) ---- */
export type IntentId = string;
export interface IntentCallSpec {
    function: string;
    args?: Record<string, unknown>;
}
export interface IntentSpec {
    description?: string;
    triggerPhrases?: string[];
    requiresLoco?: boolean;
    followUpQuestion?: string;
    recommendedCalls?: IntentCallSpec[];
    readTheseFields?: string[];
    safety?: "read_only" | "maintenance_only" | "safe";
    notes?: string;
    requiredEntities?: string[];
    returns?: string;
    exampleQuestions?: string[];
}
export type IntentCatalog = Record<IntentId, IntentSpec>;
/** ---- Contract types (mirrors chatResponse.schema.json) ---- */
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
/** ---- Function catalog types (subset of FUNCTION_CATALOG.json) ---- */
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
            properties?: Record<string, unknown>;
        };
        requires?: {
            requiredEntities?: string[];
            missingEntityPrompt?: string;
        };
    }>;
}
/** ---- Context + config ---- */
export interface RecommenderContext {
    /**
     * Implementable “did the user/app already fetch dashboard data?” flag.
     * - If false (or missing) and we need to resolve locoNo/name -> assetId, we recommend getDashBoardData().
     * - If true and resolution still fails, we ask the user to re-check the identifier.
     */
    dashboardDataFresh?: boolean;
    /**
     * Optional snapshot the host app already has.
     * Accepts either:
     * - getDashBoardData() result shape: { value: { assetData: Record<assetId, locoObj> } }
     * - raw DB snapshot shape: { data: { locomotives: Record<assetId, locoObj> } }
     * - direct assetData map: Record<assetId, locoObj>
     */
    dashboardSnapshot?: unknown;
    /**
     * Hard safety switch: allow maintenance_only intents (write ops / jobs).
     * Default: false (advisor mode).
     */
    allowMaintenanceIntents?: boolean;
}
export interface RuleBasedRecommenderConfig {
    /** Matches chatResponse.schema.json "version" */
    responseVersion?: string;
    /** Intent catalog (defaults to your project INTENT_CATALOG) */
    intentCatalog?: IntentCatalog;
    /** Function catalog (REQUIRED) */
    functionCatalog: FunctionCatalogJson;
    /**
     * Optional: override how locoNo/name are resolved to assetId from a snapshot.
     * Return:
     * - { assetId } when resolved uniquely
     * - { ambiguous: true, candidates: [...] } when multiple matches
     * - null when not found
     */
    resolveAssetId?: (input: {
        extraction: LocoQuery;
        snapshot: unknown;
    }) => {
        assetId: string;
    } | {
        ambiguous: true;
        candidates: Array<{
            assetId: string;
            locoNo?: string;
            name?: string;
        }>;
    } | null;
    /**
     * Optional: additional redaction keywords (in addition to built-ins).
     * Use this to extend policy without changing logic.
     */
    extraSensitiveKeywords?: string[];
}
export declare class RuleBasedRecommender {
    private readonly intentCatalog;
    private readonly functionIndex;
    private readonly responseVersion;
    private readonly resolveAssetIdOverride?;
    private readonly sensitiveKeywords;
    constructor(config: RuleBasedRecommenderConfig);
    recommend(userTextRaw: string, ctx?: RecommenderContext): ChatResponse;
    /** ---- Response helpers (schema-compliant) ---- */
    private needsFollowup;
    private outOfScope;
    private error;
    private answerWithSafeStarter;
    /** ---- Policy checks ---- */
    private isSensitiveRequest;
    /** ---- Loco resolution ---- */
    private resolveAssetIdIfPossible;
    /** ---- Call building + catalog enforcement ---- */
    private buildCalls;
    private maybePrependDashboardFetch;
    private filterCallsAgainstCatalog;
}
/** ---- Convenience factory ---- */
export declare function createRuleBasedRecommender(config: RuleBasedRecommenderConfig): RuleBasedRecommender;
