/**
 * ruleBasedRecommender.ts
 *
 * Deterministic (non-LLM) recommender that:
 * - Routes a user question -> best Adapter Intent (BM25-ish lexical rules)
 * - Extracts locomotive identifiers (assetId / locoNo / name)
 * - Maps adapter intent -> service-specific function via adapter layer
 * - Resolves locoNo/name -> assetId using a provided dashboard snapshot (optional)
 *
 * ADAPTER-AWARE FLOW:
 * 1. User input → Extract entities (assetId, locoNo, name)
 * 2. BM25 match against ADAPTER intents (canonicalExamples, tags, description)
 * 3. Selected adapter intent → adapter.resolveCall() → service function
 * 4. Guards validate against FUNCTION_CATALOG.json
 * 5. User sees response mentioning actual service function names
 *
 * SAFETY:
 * - Suggest-only: NEVER execute anything, never claim execution.
 * - Catalog-only: recommend ONLY functions that are recommendable:true in FUNCTION_CATALOG.json.
 * - Redaction: refuse requests for inspector email/signature/MD5/imgName.
 * - Deny-by-default: if routing confidence is low/ambiguous => needs_followup, recommend nothing.
 * - needs_followup/out_of_scope/error MUST return recommendedCalls: [] (schema rule).
 */

import { extractLocoQuery, type LocoQuery } from "./../nlp/extractLocoQuery";
import {
  type ChatStatus,
  type ExecutionPolicy,
  type CallSpec,
  type ChatResponse,
} from "./../contracts";

// Import adapter types and default adapter
import type {
  IDashboardAdapter,
  AdapterIntentDefinition,
  AdapterMethod,
} from "./../adapters/adapterTypes";
import { getLiteDashboardAdapter } from "./../adapters/liteDashboardAdapter";
import type { FunctionCatalogJson as GuardFunctionCatalogJson } from "../guards/catalogGuard";

/** ---- Re-export contract types for backward compatibility ---- */
export type { ChatStatus, ExecutionPolicy, CallSpec, ChatResponse };

export type LexicalIntentScore = { intentId: string; score: number; debugWhy?: string[] };
export type LexicalRankResult = {
  ranked: LexicalIntentScore[];
  overrideIntentId: string | null;
};

/** ---- Function catalog types ---- */

export type FunctionCatalogJson = GuardFunctionCatalogJson & {
  functions: Array<
    GuardFunctionCatalogJson["functions"][number] & {
      requires?: {
        requiredEntities?: string[];
        missingEntityPrompt?: string;
      };
    }
  >;
};

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
  /** The adapter to use for intent matching and service call resolution */
  adapter?: IDashboardAdapter;
  /** Function catalog for validation (guards) */
  functionCatalog: FunctionCatalogJson;
  /** Custom assetId resolver (optional) */
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

/** Fleet bias: if query is clearly fleet-level, prefer requiresLocoRef:false intents */
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

/** ---- Search index types (BM25-ish) ---- */

type AdapterIntentDoc = {
  intentId: string;
  intent: AdapterIntentDefinition;
  tf: Map<string, number>;
  docLen: number;
  triggerPhrasesNorm: string[];
};

type AdapterIntentSearchIndex = {
  docs: AdapterIntentDoc[];
  idf: Map<string, number>;
  avgDocLen: number;
};

/** ---- Resolution types ---- */

type AssetCandidate = { assetId: string; locoNo?: string; name?: string };
type ResolveResult = { assetId: string } | { ambiguous: true; candidates: AssetCandidate[] } | null;

/** ---- Main Recommender Class ---- */

export class RuleBasedRecommender {
  private readonly adapter: IDashboardAdapter;
  private readonly functionIndex: FunctionIndex;
  private readonly responseVersion: string;
  private readonly resolveAssetIdOverride?: RuleBasedRecommenderConfig["resolveAssetId"];
  private readonly sensitiveKeywords: string[];
  private readonly searchIndex: AdapterIntentSearchIndex;

  constructor(config: RuleBasedRecommenderConfig) {
    // Use provided adapter or default to LiteDashboardAdapter
    this.adapter = config.adapter ?? getLiteDashboardAdapter();
    this.functionIndex = indexFunctionCatalog(config.functionCatalog);
    this.responseVersion = config.responseVersion ?? DEFAULT_RESPONSE_VERSION;
    this.resolveAssetIdOverride = config.resolveAssetId;

    const extras = (config.extraSensitiveKeywords ?? []).map((s) => s.toLowerCase());
    this.sensitiveKeywords = [...BASE_SENSITIVE_KEYWORDS, ...extras].map((s) => s.toLowerCase());

    // Build BM25-ish index from ADAPTER intents
    this.searchIndex = buildAdapterIntentSearchIndex(this.adapter.getIntents());
  }

  precheck(userTextRaw: string, ctx: RecommenderContext = {}): ChatResponse | null {
    const userText = normalize(userTextRaw);

    if (!userText) {
      return this.needsFollowup("What would you like to know about the locomotive dashboard?");
    }

    if (this.isSensitiveRequest(userText)) {
      return this.outOfScope(
        "I can't help with inspector emails/signatures (or related metadata). Those fields are always redacted.",
        ['Safe alternative: ask "Who did the last inspection?" (inspector name is allowed).'],
      );
    }

    if (!ctx.allowMaintenanceIntents && looksLikeWriteRequest(userText)) {
      return this.outOfScope(
        "This request looks like it would change data (update/rebuild). This chatbot is suggest-only and blocks write/maintenance actions.",
        ["Safe alternative: ask to *view* the current state/credit/inspections instead."],
      );
    }

    return null;
  }

  rankIntents(userTextRaw: string): LexicalRankResult {
    const userText = normalize(userTextRaw);
    if (!userText) {
      return { ranked: [], overrideIntentId: null };
    }

    const extractionBase = extractLocoQuery(userTextRaw);
    const extraction = patchExtraction(extractionBase, userTextRaw);
    const overrideIntentId = shortFormIntentOverride(userText, extraction, this.adapter.getIntents());

    const ranked = rankAdapterIntentsBM25(userText, this.searchIndex, {
      fleetQuery: looksLikeFleetQuery(userTextRaw, extraction),
    });

    return { ranked, overrideIntentId };
  }

  recommendForIntent(
    intentId: string,
    userTextRaw: string,
    ctx: RecommenderContext = {},
    extraNotes?: string[],
  ): ChatResponse {
    const precheck = this.precheck(userTextRaw, ctx);
    if (precheck) return precheck;

    const extractionBase = extractLocoQuery(userTextRaw);
    const extraction = patchExtraction(extractionBase, userTextRaw);

    const adapterIntent = this.adapter.getIntents().find((i) => i.id === intentId);
    if (!adapterIntent) {
      return this.error("Internal error: matched an intent that does not exist in the adapter.", [
        `intentId=${intentId}`,
      ]);
    }

    return this.buildResponseForIntent(adapterIntent, extraction, ctx, extraNotes);
  }

  recommend(userTextRaw: string, ctx: RecommenderContext = {}): ChatResponse {
    const precheck = this.precheck(userTextRaw, ctx);
    if (precheck) return precheck;

    const userText = normalize(userTextRaw);

    // 3) Extract entities (and patch extraction for locoNo patterns + bare numbers)
    const extractionBase = extractLocoQuery(userTextRaw);
    const extraction = patchExtraction(extractionBase, userTextRaw);

    // 4) Short-form overrides (digits-only / assetId-only)
    const overrideIntentId = shortFormIntentOverride(userText, extraction, this.adapter.getIntents());
    let matchedIntentId: string | null = overrideIntentId;

    // 5) Rank adapter intents using BM25-ish scoring (with fleet bias)
    let best: { intentId: string; score: number; debugWhy?: string[] } | undefined;
    let second: { intentId: string; score: number; debugWhy?: string[] } | undefined;

    if (!matchedIntentId) {
      const fleetQuery = looksLikeFleetQuery(userTextRaw, extraction);
      const ranked = rankAdapterIntentsBM25(userText, this.searchIndex, {
        fleetQuery,
      });

      best = ranked[0];
      second = ranked[1];

      // Fleet preference: if fleet-like and user did NOT specify a loco, prefer requiresLocoRef:false intents
      if (fleetQuery && !hasAnyLocoRef(extraction)) {
        const intents = this.adapter.getIntents();
        const fleetPick = ranked.find((r) => {
          const intent = intents.find((i) => i.id === r.intentId);
          return intent && !intent.requiresLocoRef;
        });
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

      matchedIntentId = best.intentId;
    }

    // 6) Find the matched adapter intent
    const adapterIntent = this.adapter.getIntents().find((i) => i.id === matchedIntentId);
    if (!adapterIntent) {
      return this.error("Internal error: matched an intent that does not exist in the adapter.", [`intentId=${matchedIntentId}`]);
    }

    return this.buildResponseForIntent(adapterIntent, extraction, ctx, best?.debugWhy);
  }

  private buildResponseForIntent(
    adapterIntent: AdapterIntentDefinition,
    extraction: LocoQuery,
    ctx: RecommenderContext,
    extraNotes?: string[],
  ): ChatResponse {
    // 7) Check if intent requires locomotive reference
    if (adapterIntent.requiresLocoRef && !hasAnyLocoRef(extraction)) {
      return this.needsFollowup(
        adapterIntent.followUpQuestion ?? `To ${adapterIntent.description.toLowerCase()}, I need a locomotive number or ID.`,
        [`Adapter intent "${adapterIntent.id}" requires loco reference but none found in query`],
      );
    }

    // 8) Resolve assetId if possible
    const resolution = this.resolveAssetIdDetailed(extraction, ctx);
    const resolvedAssetId = resolution && "assetId" in resolution ? resolution.assetId : null;
    const effectiveAssetId = resolvedAssetId ?? extraction.assetId ?? null;

    // 9) Use adapter to resolve the call to service-specific function
    // ✅ Pass BOTH locoNo AND assetId so adapter can generate proper reply text
    const resolvedCall = this.adapter.resolveCall(adapterIntent.adapterMethod, {
      assetId: effectiveAssetId ?? undefined,
      locoNo: extraction.locoNo ?? undefined,
    });

    // 10) Handle unresolved calls (missing required assetId)
    if (!resolvedCall) {
      // If we have locoNo/name but couldn't resolve to assetId, and the adapter needs it
      if (hasLocoNoOrName(extraction) && !effectiveAssetId) {
        const entered = extraction.locoNo ? `loco number "${extraction.locoNo}"` : `name "${extraction.name}"`;

        // Ambiguous match: list candidates
        if (resolution && "ambiguous" in resolution) {
          const cands = resolution.candidates
            .slice(0, 8)
            .map((c) => `${c.locoNo ?? "?"} (${c.name ?? "?"}) [assetId=${c.assetId}]`)
            .join("; ");

          return this.needsFollowup(
            `I found multiple locomotives matching ${entered}. ` +
              `Please provide the correct assetId, or re-check the identifier. ` +
              `If your dashboard data might be stale, refresh it and try again. ` +
              `Candidates: ${cands}`,
            ["Ambiguous loco resolution; refusing to guess."],
          );
        }

        // Not found OR snapshot missing
        const mappingContext = ctx.dashboardSnapshot ? "in the current dashboard data" : "with the data I currently have";
        return this.needsFollowup(
          `I can't map ${entered} to a valid assetId ${mappingContext}. ` +
            `Please re-check the locomotive number/name, provide the assetId directly, ` +
            `or refresh the dashboard data and try again.`,
          ["AssetId required to execute this intent; locoNo/name did not resolve to a unique assetId."],
        );
      }

      // Generic failure
      return this.needsFollowup(
        adapterIntent.followUpQuestion ?? "I need a locomotive assetId to complete this request.",
        [`Adapter method "${adapterIntent.adapterMethod}" could not be resolved - missing required parameters`],
      );
    }

    // 11) Validate the resolved function against the catalog
    const fnSpec = this.functionIndex[resolvedCall.functionName];
    if (!fnSpec) {
      return this.outOfScope(
        `The function "${resolvedCall.functionName}" is not available in the current function catalog.`,
        [`Function not found in FUNCTION_CATALOG.json`],
      );
    }

    if (!fnSpec.recommendable) {
      return this.outOfScope(
        `The function "${resolvedCall.functionName}" is not recommendable.`,
        [`Function has recommendable=false in catalog`],
      );
    }

    if (!fnSpec.readOnly) {
      return this.outOfScope(
        `The function "${resolvedCall.functionName}" has side effects and is blocked in safe mode.`,
        [`Function has readOnly=false in catalog`],
      );
    }

    // 12) Build the final CallSpec
    const callSpec: CallSpec = {
      functionName: resolvedCall.functionName,
      args: resolvedCall.args,
    };

    // 13) Sanitize readTheseFields - should already have <assetId> replaced by adapter
    const sanitizedFields = sanitizeReadTheseFields(resolvedCall.readTheseFields ?? []);

    // 14) Build notes
    const notes: string[] = [];
    
    // ✅ Add locoNo → assetId mapping info first (most important for users)
    if (extraction.locoNo && effectiveAssetId) {
      notes.push(`Locomotive ${extraction.locoNo} → assetId: ${effectiveAssetId}`);
    } else if (effectiveAssetId) {
      notes.push(`Using assetId: ${effectiveAssetId}`);
    }
    
    // Add technical notes
    notes.push(`Adapter Intent: ${adapterIntent.id}`);
    notes.push(`Adapter Method: ${adapterIntent.adapterMethod}`);
    notes.push(`Service: ${this.adapter.getServiceName()}`);
    
    if (extraNotes?.length) notes.push(...extraNotes);

    // ✅ Use the adapter's reply text which includes the mapping and field info
    return {
      version: this.responseVersion,
      status: "answer",
      executionPolicy: "suggest_only",
      replyText: resolvedCall.replyText,
      recommendedCalls: [callSpec],
      ...(sanitizedFields.length ? { readTheseFields: sanitizedFields } : {}),
      notes,
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
}

/** ---- Build BM25 index from ADAPTER intents ---- */

function buildAdapterIntentSearchIndex(intents: AdapterIntentDefinition[]): AdapterIntentSearchIndex {
  const docs: AdapterIntentDoc[] = [];
  const df = new Map<string, number>();

  for (const intent of intents) {
    const parts: string[] = [];
    
    // Add description
    parts.push(intent.description);
    
    // Add canonical examples (primary matching source)
    for (const example of intent.canonicalExamples) {
      parts.push(example);
    }
    
    // Add tags
    for (const tag of intent.tags) {
      parts.push(tag);
    }

    const docText = parts.join(" ");
    const tokens = tokenize(docText);

    const tf = new Map<string, number>();
    for (const tok of tokens) tf.set(tok, (tf.get(tok) ?? 0) + 1);

    for (const tok of new Set(tokens)) df.set(tok, (df.get(tok) ?? 0) + 1);

    docs.push({
      intentId: intent.id,
      intent,
      tf,
      docLen: tokens.length,
      triggerPhrasesNorm: intent.canonicalExamples.map((x) => normalize(x)),
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

/** ---- Rank adapter intents using BM25 ---- */

function rankAdapterIntentsBM25(
  normalizedUserText: string,
  index: AdapterIntentSearchIndex,
  opts: { fleetQuery: boolean },
): Array<{ intentId: string; score: number; debugWhy?: string[] }> {
  const qTokens = tokenize(normalizedUserText);
  const k1 = 1.2;
  const b = 0.75;

  const results: Array<{ intentId: string; score: number; debugWhy: string[] }> = [];

  for (const doc of index.docs) {
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

/** ---- Short-form routing overrides ---- */

function shortFormIntentOverride(
  userTextNormalized: string,
  extraction: LocoQuery,
  intents: AdapterIntentDefinition[],
): string | null {
  // If user just typed a loco number, default to ADAPTER_FIND_LOCOMOTIVE if available
  if (/^\d{3,5}$/.test(userTextNormalized) && extraction.locoNo) {
    const findIntent = intents.find((i) => i.id === "ADAPTER_FIND_LOCOMOTIVE");
    if (findIntent) return findIntent.id;
  }

  // If user just typed an assetId, default to ADAPTER_FIND_LOCOMOTIVE if available
  if (/^[a-f0-9]{24}$/.test(userTextNormalized) && extraction.assetId) {
    const findIntent = intents.find((i) => i.id === "ADAPTER_FIND_LOCOMOTIVE");
    if (findIntent) return findIntent.id;
  }

  return null;
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

/** ---- Catalog indexing ---- */

function indexFunctionCatalog(cat: FunctionCatalogJson): FunctionIndex {
  const idx: FunctionIndex = {};
  for (const f of cat.functions ?? []) idx[f.name] = f;
  return idx;
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
