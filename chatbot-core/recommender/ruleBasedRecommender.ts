/**
 * ruleBasedRecommender.ts
 *
 * Deterministic (non-LLM) recommender that:
 * - Routes a user question -> best Intent (BM25-ish lexical rules)
 * - Extracts locomotive identifiers (assetId / locoNo / name)
 * - Resolves locoNo/name -> assetId using a provided dashboard snapshot (optional)
 *
 * ✅ AssetId mapping rule:
 * - ONLY when the chosen intent truly needs a real assetId to EXECUTE a non-dashboard function:
 *    1) Try to map locoNo/name -> assetId from the provided snapshot (if any)
 *    2) If mapping fails (not found OR ambiguous OR snapshot missing), STOP and say:
 *       "I can't map that loco to a valid assetId. Re-check identifier, provide assetId, or refresh dashboard data."
 * - No "fresh/not fresh" assumptions, no "even after refresh" claims.
 *
 * SAFETY:
 * - Suggest-only: NEVER execute anything, never claim execution.
 * - Catalog-only: recommend ONLY functions that are recommendable:true in FUNCTION_CATALOG.json.
 * - Redaction: refuse requests for inspector email/signature/MD5/imgName.
 * - Deny-by-default: if routing confidence is low/ambiguous => needs_followup, recommend nothing.
 * - needs_followup/out_of_scope/error MUST return recommendedCalls: [] (schema rule).
 */

import { extractLocoQuery, type LocoQuery } from "./../nlp/extractLocoQuery";
import { INTENT_CATALOG as DEFAULT_INTENT_CATALOG } from "./../intents/intentCatalog";
import {
  type ChatStatus,
  type ExecutionPolicy,
  type CallSpec,
  type ChatResponse,
} from "./../contracts";

/** ---- Intent types ---- */

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
  safety?: "safe" | "read_only" | "maintenance_only";
  notes?: string;
  requiredEntities?: string[];
  returns?: string;
  exampleQuestions?: string[];
}

export type IntentCatalog = Record<IntentId, IntentSpec>;

/** ---- Contract types (mirrors chatResponse.schema.json) ---- */

// REMOVE these type definitions (now imported from contracts):
// - ChatStatus
// - ExecutionPolicy
// - CallSpec
// - ChatResponse

// Re-export for backward compatibility
export type { ChatStatus, ExecutionPolicy, CallSpec, ChatResponse };

/** ---- Function catalog types ---- */

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

type FunctionSpec = FunctionCatalogJson["functions"][number];
type FunctionIndex = Record<string, FunctionSpec>;

/** ---- Context + config ---- */

export interface RecommenderContext {
  dashboardDataFresh?: boolean;
  dashboardSnapshot?: unknown;
  allowMaintenanceIntents?: boolean;
}

export interface RuleBasedRecommenderConfig {
  responseVersion?: string;
  intentCatalog?: IntentCatalog;
  functionCatalog: FunctionCatalogJson;
  resolveAssetId?: (input: {
    extraction: LocoQuery;
    snapshot: unknown;
  }) =>
    | { assetId: string }
    | { ambiguous: true; candidates: Array<{ assetId: string; locoNo?: string; name?: string }> }
    | null;
  extraSensitiveKeywords?: string[];
}

/** ---- Implementation constants ---- */

const DEFAULT_RESPONSE_VERSION = "1.0";

/** Confidence gating (deny-by-default) */
const MIN_INTENT_SCORE = 1.8;
const MIN_SCORE_MARGIN = 0.6;

/** Fleet bias: if query is clearly fleet-level, prefer requiresLoco:false intents */
const FLEET_INTENT_MIN_SCORE = 1.2;

const BASE_SENSITIVE_KEYWORDS = [
  "email", "e-mail", "signature", "sig ", "md5", "hash", "imgname", "image name",
  "lastinspec.user.email", "lastinspec.user.signature", "lastinspec.user.signature.md5",
  "lastinspec.user.signature.img", "signature status", "signature image",
  "user.email", "user.signature",
];

/** Write detection with word boundaries (prevents "updatedAt" false positives) */
const WRITE_VERB_REGEXES: RegExp[] = [
  /\bset\b/i, /\bmark\b/i, /\bchange\b/i, /\bedit\b/i, /\bsave\b/i,
  /\brebuild\b/i, /\brecalculate\b/i, /\brun\b/i, /\bfix\b/i, /\bupdate\b/i,
];

const STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "and", "or", "for", "on", "in", "is", "are",
  "was", "were", "be", "been", "with", "show", "tell", "me", "what", "which",
  "how", "when", "where", "does", "do", "did", "has", "have", "had",
]);

const PLACEHOLDER_STRINGS = new Set(["$assetid", "<assetid>", "$locoid"]);

function isPlaceholderValue(v: unknown): boolean {
  if (typeof v !== "string") return false;
  return PLACEHOLDER_STRINGS.has(v.trim().toLowerCase());
}

/** ---- Search index types (BM25-ish) ---- */

type IntentDoc = {
  intentId: IntentId;
  spec: IntentSpec;
  tf: Map<string, number>;
  docLen: number;
  triggerPhrasesNorm: string[];
};

type IntentSearchIndex = {
  docs: IntentDoc[];
  idf: Map<string, number>;
  avgDocLen: number;
};

/** ---- Resolution types ---- */

type AssetCandidate = { assetId: string; locoNo?: string; name?: string };
type ResolveResult = { assetId: string } | { ambiguous: true; candidates: AssetCandidate[] } | null;

/** ---- Main Recommender Class ---- */

export class RuleBasedRecommender {
  private readonly intentCatalog: IntentCatalog;
  private readonly functionIndex: FunctionIndex;
  private readonly responseVersion: string;
  private readonly resolveAssetIdOverride?: RuleBasedRecommenderConfig["resolveAssetId"];
  private readonly sensitiveKeywords: string[];
  private readonly searchIndex: IntentSearchIndex;

  constructor(config: RuleBasedRecommenderConfig) {
    this.intentCatalog = config.intentCatalog ?? (DEFAULT_INTENT_CATALOG as unknown as IntentCatalog);
    this.functionIndex = indexFunctionCatalog(config.functionCatalog);
    this.responseVersion = config.responseVersion ?? DEFAULT_RESPONSE_VERSION;
    this.resolveAssetIdOverride = config.resolveAssetId;

    const extras = (config.extraSensitiveKeywords ?? []).map((s) => s.toLowerCase());
    this.sensitiveKeywords = [...BASE_SENSITIVE_KEYWORDS, ...extras].map((s) => s.toLowerCase());

    // Build BM25-ish intent index once
    this.searchIndex = buildIntentSearchIndex(this.intentCatalog, this.functionIndex);
  }

  recommend(userTextRaw: string, ctx: RecommenderContext = {}): ChatResponse {
    const userText = normalize(userTextRaw);

    // 0) Empty input
    if (!userText) {
      return this.needsFollowup("What would you like to know about the locomotive dashboard?");
    }

    // 1) Redaction refusal
    if (this.isSensitiveRequest(userText)) {
      return this.outOfScope(
        "I can't help with inspector emails/signatures (or related metadata). Those fields are always redacted.",
        ['Safe alternative: ask "Who did the last inspection?" (inspector name is allowed).'],
      );
    }

    // 2) Write/side-effect request refusal
    if (!ctx.allowMaintenanceIntents && looksLikeWriteRequest(userText)) {
      return this.outOfScope(
        "This request looks like it would change data (update/rebuild). This chatbot is suggest-only and blocks write/maintenance actions.",
        ["Safe alternative: ask to *view* the current state/credit/inspections instead."],
      );
    }

    // 3) Extract entities (and patch extraction for locoNo patterns + bare numbers)
    const extractionBase = extractLocoQuery(userTextRaw);
    const extraction = patchExtraction(extractionBase, userTextRaw);
    const extraEntities = extractExtraEntities(userTextRaw);

    // 4) Short-form overrides (digits-only / assetId-only)
    const overrideIntentId = shortFormIntentOverride(userText, extraction, this.intentCatalog);
    let intentId: IntentId | null = overrideIntentId;

    // 5) Rank intents using BM25-ish scoring (with fleet bias)
    let best: { intentId: IntentId; score: number; debugWhy?: string[] } | undefined;
    let second: { intentId: IntentId; score: number; debugWhy?: string[] } | undefined;

    if (!intentId) {
      const fleetQuery = looksLikeFleetQuery(userTextRaw, extraction);
      const ranked = rankIntentsBM25(userText, this.searchIndex, {
        allowMaintenanceIntents: !!ctx.allowMaintenanceIntents,
        fleetQuery,
      });

      best = ranked[0];
      second = ranked[1];

      // Fleet preference: if fleet-like and user did NOT specify a loco, prefer requiresLoco:false intents
      if (fleetQuery && !hasAnyLocoRef(extraction)) {
        const fleetPick = ranked.find((r) => (this.intentCatalog[r.intentId]?.requiresLoco ?? false) === false);
        if (fleetPick && fleetPick.score >= FLEET_INTENT_MIN_SCORE) {
          best = fleetPick;
          second = ranked.find((r) => r.intentId !== fleetPick.intentId);
        }
      }

      // Deny-by-default on low confidence or ambiguous top2
      if (!best || best.score < MIN_INTENT_SCORE || (second && best.score - second.score < MIN_SCORE_MARGIN)) {
        return this.needsFollowup(
          "I'm not sure which dashboard intent you mean. Are you asking about: dashboard overview, fleet lists, out-of-service, non-compliant, last inspection, due inspection, daily due, engine hours, MU id, or out-of-use credit?",
          [
            `RoutingConfidence: best=${best?.intentId ?? "none"}(${best?.score?.toFixed(2) ?? "0"})` +
              (second ? ` second=${second.intentId}(${second.score.toFixed(2)})` : ""),
          ],
        );
      }

      intentId = best.intentId;
    }

    const intent = this.intentCatalog[intentId] as IntentSpec | undefined;
    if (!intent) {
      return this.error("Internal error: matched an intent that does not exist in the catalog.", [`intentId=${intentId}`]);
    }

    // 6) Block maintenance intents unless explicitly allowed
    if (intent.safety === "maintenance_only" && !ctx.allowMaintenanceIntents) {
      return this.outOfScope(
        "That action is maintenance-only (side effects) and is blocked in advisor mode.",
        ["Try asking for the current state/credit/inspection info instead (read-only)."],
      );
    }

    // 7) Determine whether this intent ACTUALLY needs assetId to EXECUTE calls
    const needsAssetIdForCalls = intentNeedsAssetIdToExecuteCalls(intent, this.functionIndex);

    // 8) Resolve assetId if possible (only used when helpful; never guessed)
    const resolution = this.resolveAssetIdDetailed(extraction, ctx);
    const resolvedAssetId = resolution && "assetId" in resolution ? resolution.assetId : null;
    const effectiveAssetId = resolvedAssetId ?? extraction.assetId ?? null;

    /**
     * ✅ SPECIAL FLOW: AssetId mapping gate
     * If the intent needs a real assetId to EXECUTE calls, and the user gave locoNo/name but we can't map it:
     * - STOP and ask them to re-check / provide assetId / refresh dashboard data.
     * - No "fresh/not fresh" claims.
     * - No recommendedCalls because status is needs_followup (schema rule).
     */
    if (
      needsAssetIdForCalls &&
      !effectiveAssetId &&
      !extraction.assetId &&
      hasLocoNoOrName(extraction)
    ) {
      const entered = extraction.locoNo ? `loco number "${extraction.locoNo}"` : `name "${extraction.name}"`;

      // Ambiguous match: list candidates (refuse to guess)
      if (resolution && "ambiguous" in resolution) {
        const cands = resolution.candidates
          .slice(0, 8)
          .map((c) => `${c.locoNo ?? "?"} (${c.name ?? "?"}) [assetId=${c.assetId}]`)
          .join("; ");

        return this.needsFollowup(
          `I found multiple locomotives matching ${entered}. ` +
            `Please provide the correct assetId, or re-check the identifier. ` +
            `If your dashboard data might be stale, refresh it (run getDashBoardData) and try again. ` +
            `Candidates: ${cands}`,
          ["Ambiguous loco resolution; refusing to guess."],
        );
      }

      // Not found OR snapshot missing (either way: can't map)
      const mappingContext = ctx.dashboardSnapshot ? "in the current dashboard data" : "with the data I currently have";
      return this.needsFollowup(
        `I can't map ${entered} to a valid assetId ${mappingContext}. ` +
          `Please re-check the locomotive number/name, provide the assetId directly, ` +
          `or refresh the dashboard data (run getDashBoardData) and try again.`,
        ["AssetId required to execute this intent; locoNo/name did not resolve to a unique assetId."],
      );
    }

    // 9) Enforce required entities safely (now that the mapping gate above is handled)
    const missing = firstMissingRequiredEntity(intent, {
      extraction,
      effectiveAssetId,
      thresholdHours: extraEntities.thresholdHours,
      needsAssetIdForCalls,
    });

    if (missing) {
      // For intents that use getDashBoardData and just need a loco reference (not resolved assetId),
      // we can proceed with the locoNo/name and let the user find it in the result
      if (missing === "assetId" && !needsAssetIdForCalls && hasLocoNoOrName(extraction)) {
        // Don't block - the intent can proceed, user will search the result
      } else {
        // Otherwise: ask the intent's own follow-up question
        return this.needsFollowup(
          intent.followUpQuestion ?? `I'm missing "${missing}". Can you provide it?`,
          [`MissingRequiredEntity=${missing}`],
        );
      }
    }

    // 10) Build calls (catalog-enforced)
    const calls = this.buildCalls(intent, effectiveAssetId);

    // 11) If zero safe calls, do NOT invent a fallback
    if (calls.length === 0) {
      return this.outOfScope(
        "I can't recommend a safe function call for that intent with the current function catalog.",
        [`Intent=${intentId}`, "Deny-by-default: no safe calls after catalog filtering."],
      );
    }

    // 12) Sanitize readTheseFields
    const sanitizedFields = sanitizeReadTheseFields(intent.readTheseFields ?? []);

    // 13) Build reply text
    const replyText = buildReplyText({
      intent,
      extraction,
      effectiveAssetId,
      recommendedCalls: calls,
      readFields: sanitizedFields,
    });

    const notes: string[] = [];
    if (best?.debugWhy?.length) notes.push(...best.debugWhy);
    if (intent.notes) notes.push(intent.notes);

    // Helpful note when we are using dashboard data and assetId isn't resolved
    if (
      calls.some((c) => c.functionName === "getDashBoardData") &&
      !effectiveAssetId &&
      hasLocoNoOrName(extraction)
    ) {
      const locoRef = extraction.locoNo ?? extraction.name;
      notes.push(
        `AssetId was not resolved in-chat. In the getDashBoardData() result, search value.assetData entries by locoNo="${locoRef}" to find the matching <assetId> key.`,
      );
    }

    return {
      version: this.responseVersion,
      status: "answer",
      executionPolicy: "suggest_only",
      replyText,
      recommendedCalls: calls,
      ...(sanitizedFields.length ? { readTheseFields: sanitizedFields } : {}),
      ...(notes.length ? { notes } : {}),
    };
  }

  /** ---- Response helpers ---- */

  private needsFollowup(question: string, notes?: string[]): ChatResponse {
    return {
      version: this.responseVersion,
      status: "needs_followup",
      executionPolicy: "suggest_only",
      replyText: "I need one more detail to answer that.",
      followUpQuestion: question,
      recommendedCalls: [],
      ...(notes?.length ? { notes } : {}),
    };
  }

  private outOfScope(reason: string, notes?: string[]): ChatResponse {
    return {
      version: this.responseVersion,
      status: "out_of_scope",
      executionPolicy: "suggest_only",
      replyText: reason,
      outOfScopeReason: reason,
      recommendedCalls: [],
      ...(notes?.length ? { notes } : {}),
    };
  }

  private error(message: string, notes?: string[]): ChatResponse {
    return {
      version: this.responseVersion,
      status: "error",
      executionPolicy: "suggest_only",
      replyText: message,
      recommendedCalls: [],
      ...(notes?.length ? { notes } : {}),
    };
  }

  private answerWithSafeStarter(
    replyText: string,
    calls: CallSpec[],
    readFields?: string[],
    notes?: string[],
  ): ChatResponse {
    const safeCalls = this.filterCallsAgainstCatalog(calls);
    const safeReadFields = sanitizeReadTheseFields(readFields ?? []);
    return {
      version: this.responseVersion,
      status: "answer",
      executionPolicy: "suggest_only",
      replyText,
      recommendedCalls: safeCalls,
      ...(safeReadFields.length ? { readTheseFields: safeReadFields } : {}),
      ...(notes?.length ? { notes } : {}),
    };
  }

  /** ---- Policy checks ---- */

  private isSensitiveRequest(normalizedUserText: string): boolean {
    return this.sensitiveKeywords.some((kw) => normalizedUserText.includes(kw));
  }

  /** ---- Loco resolution (detailed) ---- */

  private resolveAssetIdDetailed(extraction: LocoQuery, ctx: RecommenderContext): ResolveResult {
    if (extraction.assetId) return { assetId: extraction.assetId };
    if (!ctx.dashboardSnapshot) return null;

    if (this.resolveAssetIdOverride) {
      return this.resolveAssetIdOverride({ extraction, snapshot: ctx.dashboardSnapshot });
    }

    const assetData = extractAssetDataMap(ctx.dashboardSnapshot);
    if (!assetData) return null;

    const locoNoNorm = extraction.locoNo ? normalizeLoose(extraction.locoNo) : null;
    const nameNorm = extraction.name ? normalizeLoose(extraction.name) : null;

    const matches: AssetCandidate[] = [];

    for (const [assetId, loco] of Object.entries(assetData)) {
      if (!loco || typeof loco !== "object") continue;

      const locoAny = loco as Record<string, unknown>;

      // Try multiple field paths for locoNo
      let locoNo: string | undefined;
      if (typeof locoAny.locoNo === "string") locoNo = locoAny.locoNo;
      else if (typeof locoAny.LocoNo === "string") locoNo = locoAny.LocoNo;
      else if (typeof locoAny.locoNumber === "string") locoNo = locoAny.locoNumber;
      else if (locoAny.Locomotive && typeof locoAny.Locomotive === "object") {
        const loc = locoAny.Locomotive as Record<string, unknown>;
        if (typeof loc.locoNo === "string") locoNo = loc.locoNo;
      }

      // Try multiple field paths for name
      let name: string | undefined;
      if (typeof locoAny.name === "string") name = locoAny.name;
      else if (typeof locoAny.Name === "string") name = locoAny.Name;
      else if (locoAny.Locomotive && typeof locoAny.Locomotive === "object") {
        const loc = locoAny.Locomotive as Record<string, unknown>;
        if (typeof loc.name === "string") name = loc.name;
      }

      const locoNoCandidate = locoNo ? normalizeLoose(locoNo.trim()) : "";
      const nameCandidate = name ? normalizeLoose(name.trim()) : "";

      let hit = false;

      // Match by locoNo (digits comparison)
      if (locoNoNorm && locoNoCandidate) {
        const locoNoDigits = toDigits(locoNoNorm);
        const candidateDigits = toDigits(locoNoCandidate);
        if (locoNoDigits && candidateDigits && locoNoDigits === candidateDigits) {
          hit = true;
        } else if (locoNoCandidate === locoNoNorm) {
          hit = true;
        }
      }

      // Match by name
      if (!hit && nameNorm && nameCandidate) {
        if (nameCandidate.includes(nameNorm) || nameNorm.includes(nameCandidate)) {
          hit = true;
        }
      }

      // Check if locoNo appears in the name (e.g., "4430 SD70M")
      if (!hit && locoNoNorm && nameCandidate) {
        const numbersInName = nameCandidate.match(/\d{3,5}/g) || [];
        const targetDigits = toDigits(locoNoNorm);
        for (const num of numbersInName) {
          if (toDigits(num) === targetDigits) {
            hit = true;
            break;
          }
        }
      }

      if (hit) matches.push({ assetId, locoNo, name });
    }

    if (matches.length === 1) return { assetId: matches[0].assetId };
    if (matches.length > 1) return { ambiguous: true, candidates: matches };
    return null;
  }

  /** ---- Call building + catalog enforcement ---- */

  private buildCalls(intent: IntentSpec, assetId: string | null): CallSpec[] {
    const calls: CallSpec[] = (intent.recommendedCalls ?? []).map((c) => {
      const rawArgs = { ...(c.args ?? {}) };

      if (assetId) {
        for (const [k, v] of Object.entries(rawArgs)) {
          if (typeof v === "string" && isPlaceholderValue(v)) {
            rawArgs[k] = assetId;
          }
        }
      }

      return { functionName: c.function, args: rawArgs };
    });

    return this.filterCallsAgainstCatalog(dedupeCalls(calls));
  }

  private filterCallsAgainstCatalog(calls: CallSpec[]): CallSpec[] {
    const safe: CallSpec[] = [];
    for (const call of calls) {
      const spec = this.functionIndex[call.functionName];
      if (!spec) continue;
      if (!spec.recommendable) continue;
      if (!argsPassSchema(call.args, spec.argsSchema)) continue;
      safe.push(call);
    }
    return safe;
  }
}

/** ---- Required entity enforcement ---- */

function firstMissingRequiredEntity(
  intent: IntentSpec,
  input: {
    extraction: LocoQuery;
    effectiveAssetId: string | null;
    thresholdHours?: number | null;
    needsAssetIdForCalls: boolean;
  },
): string | null {
  const req = intent.requiredEntities ?? [];

  // If the intent references "assetId" but does NOT need it to execute calls,
  // treat this as "user must specify SOME loco reference" (assetId OR locoNo OR name).
  if ((intent.requiresLoco || req.includes("assetId")) && !input.needsAssetIdForCalls) {
    if (!hasAnyLocoRef(input.extraction) && !input.effectiveAssetId) return "assetId";
    // If user provided locoNo/name, that's sufficient for getDashBoardData-based intents
    return null;
  }

  // If we need assetId to execute calls, then assetId is truly required.
  if (input.needsAssetIdForCalls) {
    if (!input.effectiveAssetId) {
      // allow locoNo/name to exist (3-step flow handles resolution)
      if (!hasLocoNoOrName(input.extraction) && !input.extraction.assetId) return "assetId";
      // We have locoNo/name but no resolved assetId - return "assetId" to trigger 3-step flow
      return "assetId";
    }
  }

  // Other entities
  for (const ent of req) {
    if (ent === "assetId") continue; // handled above
    if (ent === "locoNo" && !input.extraction.locoNo) return "locoNo";
    if (ent === "name" && !input.extraction.name) return "name";
    if (ent === "thresholdHours") {
      if (typeof input.thresholdHours !== "number" || !Number.isFinite(input.thresholdHours)) return "thresholdHours";
    }
  }

  // Back-compat: requiresLoco means require SOME loco ref
  if (intent.requiresLoco && !hasAnyLocoRef(input.extraction) && !input.effectiveAssetId) return "assetId";

  return null;
}

/** ---- Extra entity extraction ---- */

function extractExtraEntities(userTextRaw: string): { thresholdHours?: number } {
  const t = userTextRaw;

  const m1 = t.match(/\b(over|above|exceed|exceeds|greater than|more than)\s*([\d,]+)\s*(k)?\b/i);
  if (m1) {
    const n = parseNumberMaybeK(m1[2], !!m1[3]);
    if (Number.isFinite(n)) return { thresholdHours: n };
  }

  const m2 = t.match(/\b([\d,]+)\s*(k)?\s*(engine\s*hours|hours)\b/i);
  if (m2) {
    const n = parseNumberMaybeK(m2[1], !!m2[2]);
    if (Number.isFinite(n)) return { thresholdHours: n };
  }

  return {};
}

function parseNumberMaybeK(raw: string, hasK: boolean): number {
  const cleaned = raw.replace(/,/g, "");
  const base = Number(cleaned);
  if (!Number.isFinite(base)) return NaN;
  return hasK ? base * 1000 : base;
}

/** ---- Extraction patching ---- */

function patchExtraction(extraction: LocoQuery, userTextRaw: string): LocoQuery {
  let locoNo = extraction.locoNo;
  let assetId = extraction.assetId;
  const name = extraction.name;

  // A) Accept "locoNo 8778" pattern (extractor might miss this)
  if (!locoNo) {
    const m = userTextRaw.match(/\b(loco\s*no|locono|unit\s*no|unitno|engine\s*no|engineno|locomotive)\s*[:#\-]?\s*(\d{3,5})\b/i);
    if (m) locoNo = m[2];
  }

  // B) Digits-only input => treat as locoNo
  if (!locoNo && /^\s*\d{3,5}\s*$/.test(userTextRaw)) {
    locoNo = userTextRaw.trim();
  }

  // C) AssetId-only input (24-hex)
  if (!assetId && /^\s*[a-f0-9]{24}\s*$/i.test(userTextRaw)) {
    assetId = userTextRaw.trim().toLowerCase();
  }

  return {
    ...extraction,
    assetId,
    locoNo,
    name,
    assetIds: assetId ? uniqStrings([...(extraction.assetIds ?? []), assetId]) : extraction.assetIds,
    locoNos: locoNo ? uniqStrings([...(extraction.locoNos ?? []), locoNo]) : extraction.locoNos,
  };
}

function uniqStrings(arr: string[]): string[] {
  return [...new Set(arr)];
}

/** ---- Short-form routing overrides ---- */

function shortFormIntentOverride(userTextNormalized: string, extraction: LocoQuery, catalog: IntentCatalog): IntentId | null {
  // If user just typed a loco number, default to FIND_LOCO_BY_LOCO_NUMBER if available
  if (/^\d{3,5}$/.test(userTextNormalized) && extraction.locoNo && catalog["FIND_LOCO_BY_LOCO_NUMBER"]) {
    return "FIND_LOCO_BY_LOCO_NUMBER";
  }

  // If user just typed an assetId, default to FIND_LOCO_BY_ASSET_ID if available
  if (/^[a-f0-9]{24}$/.test(userTextNormalized) && extraction.assetId && catalog["FIND_LOCO_BY_ASSET_ID"]) {
    return "FIND_LOCO_BY_ASSET_ID";
  }

  return null;
}

/** ---- Determine if an intent truly needs assetId to execute calls ---- */

function intentNeedsAssetIdToExecuteCalls(intent: IntentSpec, functionIndex: FunctionIndex): boolean {
  const calls = intent.recommendedCalls ?? [];
  
  for (const call of calls) {
    const fnSpec = functionIndex[call.function];
    if (!fnSpec) continue;
    
    // If the function requires assetId in its schema
    const required = fnSpec.argsSchema?.required ?? [];
    if (required.includes("assetId")) {
      // Check if the intent provides a placeholder for assetId
      const args = call.args ?? {};
      for (const v of Object.values(args)) {
        if (typeof v === "string" && isPlaceholderValue(v)) {
          return true; // This call needs assetId to execute
        }
      }
    }
    
    // If the function is getDashBoardData, it doesn't need assetId
    if (call.function === "getDashBoardData") {
      continue; // This call doesn't need assetId
    }
  }
  
  return false;
}

/** ---- Fleet query detection ---- */

function looksLikeFleetQuery(userTextRaw: string, extraction: LocoQuery): boolean {
  const lower = userTextRaw.toLowerCase();
  
  // If user explicitly mentioned a locomotive, it's not a fleet query
  if (hasAnyLocoRef(extraction)) return false;
  
  // Fleet-level keywords
  const fleetKeywords = [
    "all", "fleet", "every", "each", "list", "how many", "count",
    "which locomotives", "which locos", "which units",
    "out of service", "out-of-service", "non-compliant", "noncompliant",
    "daily due", "dailydue", "null muid", "null mu",
  ];
  
  return fleetKeywords.some((kw) => lower.includes(kw));
}

/** ---- Helper predicates ---- */

function hasAnyLocoRef(extraction: LocoQuery): boolean {
  return !!(extraction.assetId || extraction.locoNo || extraction.name);
}

function hasLocoNoOrName(extraction: LocoQuery): boolean {
  return !!(extraction.locoNo || extraction.name);
}

/** ---- BM25-ish Intent Ranking ---- */

function buildIntentSearchIndex(intentCatalog: IntentCatalog, functionIndex: FunctionIndex): IntentSearchIndex {
  const docs: IntentDoc[] = [];
  const df = new Map<string, number>();

  for (const [intentId, spec] of Object.entries(intentCatalog)) {
    const parts: string[] = [];
    parts.push(spec.description ?? "");

    for (const p of spec.triggerPhrases ?? []) parts.push(p);
    for (const q of spec.exampleQuestions ?? []) parts.push(q);

    for (const rc of spec.recommendedCalls ?? []) {
      const fn = functionIndex[rc.function];
      if (!fn) continue;
      for (const tag of fn.tags ?? []) parts.push(tag);
      for (const a of fn.aliases ?? []) parts.push(a);
    }

    const docText = parts.join(" ");
    const tokens = tokenize(docText);

    const tf = new Map<string, number>();
    for (const tok of tokens) tf.set(tok, (tf.get(tok) ?? 0) + 1);

    for (const tok of new Set(tokens)) df.set(tok, (df.get(tok) ?? 0) + 1);

    docs.push({
      intentId,
      spec,
      tf,
      docLen: tokens.length,
      triggerPhrasesNorm: (spec.triggerPhrases ?? []).map((x) => normalize(x)),
    });
  }

  const N = docs.length || 1;
  const idf = new Map<string, number>();
  for (const [tok, dfi] of df.entries()) {
    const val = Math.log(1 + (N - dfi + 0.5) / (dfi + 0.5));
    idf.set(tok, val);
  }

  const avgDocLen = docs.reduce((s, d) => s + d.docLen, 0) / (docs.length || 1);

  return { docs, idf, avgDocLen };
}

function rankIntentsBM25(
  normalizedUserText: string,
  index: IntentSearchIndex,
  opts: { allowMaintenanceIntents: boolean; fleetQuery: boolean },
): Array<{ intentId: IntentId; score: number; debugWhy?: string[] }> {
  const qTokens = tokenize(normalizedUserText);
  const k1 = 1.2;
  const b = 0.75;

  const results: Array<{ intentId: IntentId; score: number; debugWhy: string[] }> = [];

  for (const doc of index.docs) {
    if (!opts.allowMaintenanceIntents && doc.spec.safety === "maintenance_only") continue;

    let score = 0;
    const why: string[] = [];

    // BM25 token scoring
    for (const qt of qTokens) {
      const tf = doc.tf.get(qt) ?? 0;
      if (tf <= 0) continue;

      const idf = index.idf.get(qt) ?? 0;
      const denom = tf + k1 * (1 - b + b * (doc.docLen / (index.avgDocLen || 1)));
      const contrib = idf * ((tf * (k1 + 1)) / (denom || 1));

      score += contrib;
    }

    // Exact trigger phrase bonus (strong, deterministic)
    for (const trig of doc.triggerPhrasesNorm) {
      if (trig && normalizedUserText.includes(trig)) {
        const bonus = Math.max(2.5, trig.split(/\s+/).length * 1.0);
        score += bonus;
        why.push(`trigger="${trig}"(+${bonus.toFixed(1)})`);
      }
    }

    // Partial trigger phrase bonus (weaker)
    for (const trig of doc.triggerPhrasesNorm) {
      if (!trig) continue;
      const trigWords = trig.split(/\s+/).filter((w: string) => w.length > 2);
      let matchCount = 0;
      for (const tw of trigWords) {
        if (normalizedUserText.includes(tw)) matchCount++;
      }
      if (matchCount >= 2 && matchCount < trigWords.length) {
        const partialBonus = matchCount * 0.5;
        score += partialBonus;
        why.push(`partial="${trig}"(+${partialBonus.toFixed(1)})`);
      }
    }

    if (score > 0) results.push({ intentId: doc.intentId, score, debugWhy: why });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

/** ---- Reply text builder ---- */

function buildReplyText(input: {
  intent: IntentSpec;
  extraction: LocoQuery;
  effectiveAssetId: string | null;
  recommendedCalls: CallSpec[];
  readFields: string[];
}): string {
  const { intent, extraction, effectiveAssetId, recommendedCalls, readFields } = input;

  if (recommendedCalls.length === 0) {
    return "I cannot recommend a specific function for this request. Please try rephrasing.";
  }

  const locoLabel =
    effectiveAssetId ||
    extraction.locoNo ||
    extraction.name ||
    (intent.requiresLoco ? "that locomotive" : null);

  const callList = recommendedCalls.map((c) => c.functionName).join(", ");

  const fieldHint = readFields.length > 0
    ? ` Then read: ${readFields.slice(0, 3).join(", ")}${readFields.length > 3 ? "..." : ""}`
    : "";

  if (intent.requiresLoco && locoLabel) {
    return `To answer that for ${locoLabel}, run: ${callList}.${fieldHint} I'm only recommending the call(s); your app should execute them and show the results.`;
  }

  return `To answer that, run: ${callList}.${fieldHint} I'm only recommending the call(s); your app should execute them and show the results.`;
}

/** ---- Snapshot extraction ---- */

function extractAssetDataMap(snapshot: unknown): Record<string, unknown> | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as Record<string, unknown>;

  // A) getDashBoardData() result: { value: { assetData: { ... } } }
  const value = s.value as Record<string, unknown> | undefined;
  if (value && typeof value === "object") {
    const assetData = value.assetData;
    if (assetData && typeof assetData === "object") return assetData as Record<string, unknown>;
  }

  // B) raw DB snapshot: { data: { locomotives: { ... } } }
  const data = s.data as Record<string, unknown> | undefined;
  if (data && typeof data === "object") {
    const locos = data.locomotives;
    if (locos && typeof locos === "object") return locos as Record<string, unknown>;
  }

  // C) Direct assetData at root
  const assetDataRoot = s.assetData as Record<string, unknown> | undefined;
  if (assetDataRoot && typeof assetDataRoot === "object") {
    return assetDataRoot;
  }

  // D) Direct locomotives map at root
  const locomotivesRoot = s.locomotives as Record<string, unknown> | undefined;
  if (locomotivesRoot && typeof locomotivesRoot === "object") {
    return locomotivesRoot;
  }

  // E) Assume root IS the asset map if keys look like mongo IDs
  const keys = Object.keys(s);
  if (keys.length > 0 && /^[a-f0-9]{24}$/i.test(keys[0])) {
    return s as Record<string, unknown>;
  }

  return null;
}

/** ---- Catalog indexing + args validation ---- */

function indexFunctionCatalog(cat: FunctionCatalogJson): FunctionIndex {
  const idx: FunctionIndex = {};
  for (const f of cat.functions ?? []) idx[f.name] = f;
  return idx;
}

function argsPassSchema(args: Record<string, unknown>, schema?: FunctionSpec["argsSchema"]): boolean {
  if (!schema) return true;
  if (schema.type !== "object") return false;

  const required = schema.required ?? [];
  for (const k of required) {
    if (!(k in args)) return false;
    const v = args[k];
    if (isPlaceholderValue(v)) return false;
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean" && typeof v !== "object") return false;
    if (typeof v === "string" && v.trim().length === 0) return false;
  }

  if (schema.additionalProperties === false && schema.properties) {
    const allowed = new Set(Object.keys(schema.properties));
    for (const k of Object.keys(args)) {
      if (!allowed.has(k)) return false;
    }
  }

  return true;
}

/** ---- Redaction ---- */

function sanitizeReadTheseFields(fields: string[]): string[] {
  const forbidden = [
    "lastinspec.user.email", "lastinspec.user.signature", "lastinspec.user.signature.md5",
    "lastinspec.user.signature.status", "lastinspec.user.signature.imgname",
    "user.email", "user.signature", "email", "signature", "md5", "imgname",
  ].map((s) => s.toLowerCase());

  return (fields ?? []).filter((f) => {
    const low = String(f).toLowerCase();
    return !forbidden.some((x) => low.includes(x));
  });
}

/** ---- Utilities ---- */

function normalize(s: string): string {
  return String(s).toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeLoose(s: string): string {
  return String(s).toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t));
}

function dedupeCalls(calls: CallSpec[]): CallSpec[] {
  const seen = new Set<string>();
  const out: CallSpec[] = [];
  for (const c of calls) {
    const key = `${c.functionName}::${stableStringify(c.args)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function stableStringify(obj: unknown): string {
  if (!obj || typeof obj !== "object") return String(obj);
  const o = obj as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  const parts = keys.map((k) => `${k}:${stableStringify(o[k])}`);
  return `{${parts.join(",")}}`;
}

function looksLikeWriteRequest(normalizedUserText: string): boolean {
  const isRefreshDashboard =
    /\b(refresh|reload)\b/i.test(normalizedUserText) &&
    /\bdashboard\b/i.test(normalizedUserText);

  if (isRefreshDashboard) return false;

  return WRITE_VERB_REGEXES.some((re) => re.test(normalizedUserText));
}

function toDigits(s: string): string {
  return String(s).replace(/[^0-9]/g, "");
}

/** ---- Convenience factory ---- */

export function createRuleBasedRecommender(config: RuleBasedRecommenderConfig): RuleBasedRecommender {
  return new RuleBasedRecommender(config);
}
