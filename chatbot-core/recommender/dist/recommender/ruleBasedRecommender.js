"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuleBasedRecommender = void 0;
exports.createRuleBasedRecommender = createRuleBasedRecommender;
const extractLocoQuery_1 = require("./../nlp/extractLocoQuery");
const intentCatalog_1 = require("./../intents/intentCatalog");
/** ---- Implementation ---- */
const DEFAULT_RESPONSE_VERSION = "1.0.0";
/**
 * Always-redacted request keywords (from REDACTION_POLICY.md).
 * We refuse if the user asks for any of these.
 */
const BASE_SENSITIVE_KEYWORDS = [
    "email",
    "e-mail",
    "signature",
    "sig ",
    "md5",
    "hash",
    "imgname",
    "image name",
    "lastinspec.user.email",
    "lastinspec.user.signature",
    "lastinspec.user.signature.md5",
    "lastinspec.user.signature.img",
];
/**
 * “Write intent” keywords: if user is asking to change/save/update state,
 * advisor bot must refuse (maintenance_only).
 */
const WRITE_INTENT_KEYWORDS = [
    "update",
    "set ",
    "mark ",
    "change",
    "edit",
    "save",
    "rebuild",
    "recalculate",
    "refresh dashboard",
    "run job",
    "run build",
    "fix",
];
/**
 * A tiny stopword list for trigger scoring.
 * (We keep it minimal; this is not NLP—just noise reduction.)
 */
const STOPWORDS = new Set([
    "the",
    "a",
    "an",
    "of",
    "to",
    "and",
    "or",
    "for",
    "on",
    "in",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "with",
    "show",
    "tell",
    "me",
]);
/** ---- NEW: placeholders are not valid asset IDs ---- */
const PLACEHOLDER_STRINGS = new Set(["$assetid", "<assetid>", "$locoid"]);
function isPlaceholderValue(v) {
    if (typeof v !== "string")
        return false;
    return PLACEHOLDER_STRINGS.has(v.trim().toLowerCase());
}
class RuleBasedRecommender {
    constructor(config) {
        this.intentCatalog = config.intentCatalog ?? intentCatalog_1.INTENT_CATALOG;
        this.functionIndex = indexFunctionCatalog(config.functionCatalog);
        this.responseVersion = config.responseVersion ?? DEFAULT_RESPONSE_VERSION;
        this.resolveAssetIdOverride = config.resolveAssetId;
        const extras = (config.extraSensitiveKeywords ?? []).map((s) => s.toLowerCase());
        this.sensitiveKeywords = [...BASE_SENSITIVE_KEYWORDS, ...extras].map((s) => s.toLowerCase());
    }
    recommend(userTextRaw, ctx = {}) {
        const userText = normalize(userTextRaw);
        // 0) Empty input -> follow up (schema: no calls)
        if (!userText) {
            return this.needsFollowup("What would you like to know about the locomotive dashboard?");
        }
        // 1) Redaction refusal (schema: out_of_scope => no calls)
        if (this.isSensitiveRequest(userText)) {
            return this.outOfScope("I can’t help with inspector emails/signatures (or related metadata). Those fields are always redacted.", [
                "Safe alternative: ask “Who did the last inspection?” (inspector name is allowed).",
                "I can recommend the right read-only call if you ask for non-sensitive fields.",
            ]);
        }
        // 2) Write/side-effect request refusal (advisor mode)
        if (!ctx.allowMaintenanceIntents && looksLikeWriteRequest(userText)) {
            return this.outOfScope("This request looks like it would change data (update/rebuild). This chatbot is suggest-only and blocks write/maintenance actions.", [
                "Safe alternative: ask to *view* the current state/credit/inspections instead.",
                "If you need a rebuild/update, use your admin tooling outside the chatbot.",
            ]);
        }
        // 3) Extract loco candidates (Step 6)
        const extraction = (0, extractLocoQuery_1.extractLocoQuery)(userTextRaw);
        // 4) Pick best intent (lexical scoring)
        const ranked = rankIntents(userText, this.intentCatalog, this.functionIndex, {
            allowMaintenanceIntents: !!ctx.allowMaintenanceIntents,
        });
        const best = ranked[0];
        if (!best || best.score <= 0) {
            // Not confidently matched: we stay “answer” so we can provide a safe starter call
            return this.answerWithSafeStarter("I’m not sure which specific dashboard question you mean yet. Here’s the safest starting point: fetch the dashboard snapshot, then you can ask a more specific KPI/locomotive question.", [{ functionName: "getDashBoardData", args: {} }], ["value.summary", "value.assetData"], ["Couldn’t confidently match an intent; recommended a safe overview call."]);
        }
        const intentId = best.intentId;
        const intent = this.intentCatalog[intentId];
        if (!intent) {
            return this.error("Internal error: matched an intent that does not exist in the catalog.", [
                `intentId=${intentId}`,
            ]);
        }
        // 5) Block maintenance intents unless explicitly allowed
        if (intent.safety === "maintenance_only" && !ctx.allowMaintenanceIntents) {
            return this.outOfScope("That action is maintenance-only (side effects) and is blocked in advisor mode.", ["Try asking for the current state/credit/inspection info instead (read-only)."]);
        }
        // 6) Ensure required entities are present (locomotive + other)
        if (intent.requiresLoco) {
            const hasSomeLocoRef = !!extraction.assetId || !!extraction.locoNo || !!extraction.name;
            if (!hasSomeLocoRef) {
                return this.needsFollowup(intent.followUpQuestion ?? "Which locomotive (assetId, loco number, or name)?");
            }
        }
        // 7) Resolve assetId (if possible) using snapshot
        const resolvedAssetId = this.resolveAssetIdIfPossible(extraction, ctx);
        /**
         * ---- NEW FLOW ENFORCEMENT ----
         * If intent requires loco AND user gave locoNo/name (not assetId) AND we could not resolve:
         *   A) If dashboardDataFresh !== true -> recommend getDashBoardData() and STOP (do NOT proceed to per-loco calls)
         *   B) If dashboardDataFresh === true -> tell user we don't have that loco; echo the input; ask to re-check
         */
        if (intent.requiresLoco &&
            !resolvedAssetId &&
            !extraction.assetId &&
            (!!extraction.locoNo || !!extraction.name)) {
            const entered = extraction.locoNo ? `loco number "${extraction.locoNo}"` : `name "${extraction.name}"`;
            // A) Not fresh -> recommend refresh and stop
            if (ctx.dashboardDataFresh !== true) {
                return this.answerWithSafeStarter(`I couldn’t find ${entered} in the dashboard data I currently have. Please refresh the dashboard snapshot by running getDashBoardData(), then ask again.`, [{ functionName: "getDashBoardData", args: {} }], ["value.assetData"], ["AssetId not found from current snapshot; recommended refresh."]);
            }
            // B) Fresh but still not found -> re-check
            return this.needsFollowup(`I still can’t find ${entered} even after a refresh. I don’t have access to that locomotive in the current dashboard data. Please re-check the locomotive number/name, or provide the assetId.`);
        }
        // 8) Build recommended calls from intent (enforcing FUNCTION_CATALOG.json)
        const calls = this.buildCalls(intent, resolvedAssetId);
        // 9) If intent needs assetId but we don’t have it, optionally prepend fetch (rare now, because we enforce stop above)
        const finalCalls = this.maybePrependDashboardFetch(intent, calls, resolvedAssetId, ctx, extraction);
        // 10) If after safety filtering we have no calls -> answer safely
        if (finalCalls.length === 0) {
            return this.answerWithSafeStarter("I can’t recommend a safe function for that exact request with the current catalog. Here’s the safest overview call instead.", [{ functionName: "getDashBoardData", args: {} }], ["value.summary", "value.assetData"], [`Intent ${intentId} produced no recommendable calls after catalog filtering.`]);
        }
        // 11) Sanitize readTheseFields (redaction policy)
        const sanitizedFields = sanitizeReadTheseFields(intent.readTheseFields ?? []);
        // 12) Compose reply text (suggest-only language)
        const replyText = buildReplyText({
            intentId,
            intent,
            extraction,
            resolvedAssetId,
            recommendedCalls: finalCalls,
        });
        const notes = [];
        if (best.debugWhy?.length)
            notes.push(...best.debugWhy);
        if (intent.notes)
            notes.push(intent.notes);
        return {
            version: this.responseVersion,
            status: "answer",
            executionPolicy: "suggest_only",
            replyText,
            recommendedCalls: finalCalls,
            ...(sanitizedFields.length ? { readTheseFields: sanitizedFields } : {}),
            ...(notes.length ? { notes } : {}),
        };
    }
    /** ---- Response helpers (schema-compliant) ---- */
    needsFollowup(question, notes) {
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
    outOfScope(reason, notes) {
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
    error(message, notes) {
        return {
            version: this.responseVersion,
            status: "error",
            executionPolicy: "suggest_only",
            replyText: message,
            recommendedCalls: [],
            ...(notes?.length ? { notes } : {}),
        };
    }
    answerWithSafeStarter(replyText, calls, readFields, notes) {
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
    isSensitiveRequest(normalizedUserText) {
        return this.sensitiveKeywords.some((kw) => normalizedUserText.includes(kw));
    }
    /** ---- Loco resolution ---- */
    resolveAssetIdIfPossible(extraction, ctx) {
        // If user gave assetId explicitly, trust it as the identifier (don’t verify here).
        if (extraction.assetId)
            return extraction.assetId;
        if (!ctx.dashboardSnapshot)
            return null;
        // Use custom resolver if provided
        if (this.resolveAssetIdOverride) {
            const out = this.resolveAssetIdOverride({ extraction, snapshot: ctx.dashboardSnapshot });
            if (!out)
                return null;
            if ("assetId" in out)
                return out.assetId;
            return null; // ambiguous -> unresolved here
        }
        // Default resolver: look in snapshot for locoNo/name fields
        const assetData = extractAssetDataMap(ctx.dashboardSnapshot);
        if (!assetData)
            return null;
        const locoNoNorm = extraction.locoNo ? normalizeLoose(extraction.locoNo) : null;
        const nameNorm = extraction.name ? normalizeLoose(extraction.name) : null;
        const matches = [];
        for (const [assetId, loco] of Object.entries(assetData)) {
            if (!loco || typeof loco !== "object")
                continue;
            const locoAny = loco;
            const locoNo = typeof locoAny.locoNo === "string" ? locoAny.locoNo : undefined;
            const name = typeof locoAny.name === "string" ? locoAny.name : undefined;
            const locoNoCandidate = locoNo ? normalizeLoose(locoNo) : "";
            const nameCandidate = name ? normalizeLoose(name) : "";
            let hit = false;
            if (locoNoNorm && locoNoCandidate) {
                if (numericish(locoNoNorm) && numericish(locoNoCandidate)) {
                    if (toDigits(locoNoNorm) === toDigits(locoNoCandidate))
                        hit = true;
                }
                else if (locoNoCandidate === locoNoNorm) {
                    hit = true;
                }
            }
            if (!hit && nameNorm && nameCandidate) {
                if (nameCandidate.includes(nameNorm) || nameNorm.includes(nameCandidate))
                    hit = true;
            }
            if (hit)
                matches.push({ assetId, locoNo, name });
        }
        if (matches.length === 1)
            return matches[0].assetId;
        return null; // 0 or many => unresolved
    }
    /** ---- Call building + catalog enforcement ---- */
    buildCalls(intent, resolvedAssetId) {
        const calls = (intent.recommendedCalls ?? []).map((c) => {
            const rawArgs = { ...(c.args ?? {}) };
            // Substitute placeholders if we have a resolved value.
            if (resolvedAssetId) {
                for (const [k, v] of Object.entries(rawArgs)) {
                    if (v === "$assetId" || v === "<assetId>" || v === "$locoId") {
                        rawArgs[k] = resolvedAssetId;
                    }
                }
            }
            return {
                functionName: c.function,
                args: rawArgs,
            };
        });
        return this.filterCallsAgainstCatalog(dedupeCalls(calls));
    }
    maybePrependDashboardFetch(intent, calls, resolvedAssetId, ctx, extraction) {
        if (!intent.requiresLoco)
            return calls;
        if (resolvedAssetId || extraction.assetId)
            return calls;
        const hasLocoNoOrName = !!extraction.locoNo || !!extraction.name;
        if (!hasLocoNoOrName)
            return calls;
        if (ctx.dashboardSnapshot)
            return calls;
        const shouldRecommendFetch = ctx.dashboardDataFresh === false || ctx.dashboardDataFresh === undefined;
        if (!shouldRecommendFetch)
            return calls;
        const dashCall = { functionName: "getDashBoardData", args: {} };
        const safeDashCall = this.filterCallsAgainstCatalog([dashCall]);
        if (!safeDashCall.length)
            return calls;
        const alreadyHas = calls.some((c) => c.functionName === "getDashBoardData");
        return alreadyHas ? calls : dedupeCalls([...safeDashCall, ...calls]);
    }
    filterCallsAgainstCatalog(calls) {
        const safe = [];
        for (const call of calls) {
            const spec = this.functionIndex[call.functionName];
            if (!spec)
                continue;
            // Catalog-only + recommendable:true
            if (!spec.recommendable)
                continue;
            // Basic args validation: required fields must exist; no extra fields if additionalProperties:false
            if (!argsPassSchema(call.args, spec.argsSchema))
                continue;
            safe.push(call);
        }
        return safe;
    }
}
exports.RuleBasedRecommender = RuleBasedRecommender;
/** ---- Intent ranking (rule-based lexical matching) ---- */
function rankIntents(normalizedUserText, intentCatalog, functionIndex, opts) {
    const tokens = tokenize(normalizedUserText);
    const results = [];
    for (const [intentId, spec] of Object.entries(intentCatalog)) {
        if (!opts.allowMaintenanceIntents && spec.safety === "maintenance_only")
            continue;
        const why = [];
        let score = 0;
        // 1) triggerPhrases scoring (primary)
        const triggers = (spec.triggerPhrases ?? []).map((t) => t.toLowerCase());
        for (const trig of triggers) {
            if (!trig)
                continue;
            const trigNorm = normalize(trig);
            if (normalizedUserText.includes(trigNorm)) {
                const w = Math.max(2, trigNorm.length / 4);
                score += w;
                why.push(`trigger="${trig}" (+${w.toFixed(1)})`);
            }
        }
        // 2) Token overlap heuristic (secondary)
        const triggerTokens = new Set(triggers
            .flatMap((t) => tokenize(t))
            .filter((t) => t && !STOPWORDS.has(t)));
        let overlap = 0;
        for (const t of tokens)
            if (triggerTokens.has(t))
                overlap++;
        if (overlap) {
            const w = overlap * 0.8;
            score += w;
            why.push(`tokenOverlap=${overlap} (+${w.toFixed(1)})`);
        }
        // 3) Function tags/aliases (tiny boost)
        const fnNames = (spec.recommendedCalls ?? []).map((c) => c.function);
        const fnHints = new Set();
        for (const fn of fnNames) {
            const f = functionIndex[fn];
            if (!f)
                continue;
            for (const tag of f.tags ?? [])
                fnHints.add(tag.toLowerCase());
            for (const a of f.aliases ?? [])
                fnHints.add(a.toLowerCase());
        }
        for (const hint of fnHints) {
            const h = normalize(hint);
            if (h && normalizedUserText.includes(h)) {
                score += 0.6;
                why.push(`fnHint="${hint}" (+0.6)`);
            }
        }
        if (score > 0)
            results.push({ intentId, score, debugWhy: why });
    }
    results.sort((a, b) => b.score - a.score);
    return results.map((r) => ({ intentId: r.intentId, score: r.score, debugWhy: r.debugWhy }));
}
/** ---- Reply text builder ---- */
function buildReplyText(input) {
    const { intent, extraction, resolvedAssetId, recommendedCalls } = input;
    const locoLabel = resolvedAssetId ||
        extraction.assetId ||
        extraction.locoNo ||
        extraction.name ||
        (intent.requiresLoco ? "that locomotive" : null);
    const callList = recommendedCalls.map((c) => c.functionName).join(", ");
    if (intent.requiresLoco) {
        return `To answer that for ${locoLabel}, run: ${callList}. I’m only recommending the call(s); your app should execute them and show the results.`;
    }
    return `To answer that, run: ${callList}. I’m only recommending the call(s); your app should execute them and show the results.`;
}
/** ---- Snapshot extraction ---- */
function extractAssetDataMap(snapshot) {
    if (!snapshot || typeof snapshot !== "object")
        return null;
    const s = snapshot;
    // A) getDashBoardData() result: { value: { assetData: { ... } } }
    const value = s.value;
    if (value && typeof value === "object") {
        const assetData = value.assetData;
        if (assetData && typeof assetData === "object")
            return assetData;
    }
    // B) raw DB snapshot: { data: { locomotives: { ... } } }
    const data = s.data;
    if (data && typeof data === "object") {
        const locos = data.locomotives;
        if (locos && typeof locos === "object")
            return locos;
    }
    // C) direct map
    const keys = Object.keys(s);
    if (keys.length && keys.every((k) => typeof k === "string")) {
        return s;
    }
    return null;
}
/** ---- Catalog indexing + args validation ---- */
function indexFunctionCatalog(cat) {
    const idx = {};
    for (const f of cat.functions ?? [])
        idx[f.name] = f;
    return idx;
}
function argsPassSchema(args, schema) {
    // If no schema, accept (catalog still enforced by name + recommendable)
    if (!schema)
        return true;
    if (schema.type !== "object")
        return false;
    const required = schema.required ?? [];
    for (const k of required) {
        if (!(k in args))
            return false;
        const v = args[k];
        // Reject placeholders for required args (enforces "don’t proceed without real assetId")
        if (isPlaceholderValue(v))
            return false;
        if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean" && typeof v !== "object")
            return false;
        // enforce non-empty for strings
        if (typeof v === "string" && v.trim().length === 0)
            return false;
    }
    if (schema.additionalProperties === false && schema.properties) {
        const allowed = new Set(Object.keys(schema.properties));
        for (const k of Object.keys(args)) {
            if (!allowed.has(k))
                return false;
        }
    }
    return true;
}
/** ---- Redaction: strip any read fields that are forbidden ---- */
function sanitizeReadTheseFields(fields) {
    const forbidden = [
        ".LastInspec.user.email",
        ".LastInspec.user.signature",
        ".LastInspec.user.signature.md5",
        ".LastInspec.user.signature.status",
        ".LastInspec.user.signature.imgName",
        "LastInspec.user.email",
        "LastInspec.user.signature",
    ].map((s) => s.toLowerCase());
    return (fields ?? []).filter((f) => {
        const low = String(f).toLowerCase();
        return !forbidden.some((x) => low.includes(x));
    });
}
/** ---- Utilities ---- */
function normalize(s) {
    return String(s).toLowerCase().replace(/\s+/g, " ").trim();
}
function normalizeLoose(s) {
    return String(s).toLowerCase().replace(/\s+/g, " ").trim();
}
function tokenize(s) {
    return normalize(s)
        .split(/[^a-z0-9]+/g)
        .map((t) => t.trim())
        .filter(Boolean)
        .filter((t) => !STOPWORDS.has(t));
}
function dedupeCalls(calls) {
    const seen = new Set();
    const out = [];
    for (const c of calls) {
        const key = `${c.functionName}::${stableStringify(c.args)}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(c);
    }
    return out;
}
function stableStringify(obj) {
    if (!obj || typeof obj !== "object")
        return String(obj);
    const o = obj;
    const keys = Object.keys(o).sort();
    const parts = keys.map((k) => `${k}:${stableStringify(o[k])}`);
    return `{${parts.join(",")}}`;
}
function looksLikeWriteRequest(normalizedUserText) {
    return WRITE_INTENT_KEYWORDS.some((kw) => normalizedUserText.includes(kw));
}
function numericish(s) {
    return /^[0-9\s]+$/.test(s);
}
function toDigits(s) {
    return String(s).replace(/[^0-9]/g, "");
}
/** ---- Convenience factory ---- */
function createRuleBasedRecommender(config) {
    return new RuleBasedRecommender(config);
}
