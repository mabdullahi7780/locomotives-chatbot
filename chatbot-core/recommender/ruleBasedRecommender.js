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
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuleBasedRecommender = void 0;
exports.createRuleBasedRecommender = createRuleBasedRecommender;
var extractLocoQuery_1 = require("./../nlp/extractLocoQuery");
var intentCatalog_1 = require("./../intents/intentCatalog");
/** ---- Implementation ---- */
var DEFAULT_RESPONSE_VERSION = "1.0.0";
/**
 * Always-redacted request keywords (from REDACTION_POLICY.md).
 * We refuse if the user asks for any of these.
 */
var BASE_SENSITIVE_KEYWORDS = [
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
var WRITE_INTENT_KEYWORDS = [
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
var STOPWORDS = new Set([
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
var PLACEHOLDER_STRINGS = new Set(["$assetid", "<assetid>", "$locoid"]);
function isPlaceholderValue(v) {
    if (typeof v !== "string")
        return false;
    return PLACEHOLDER_STRINGS.has(v.trim().toLowerCase());
}
var RuleBasedRecommender = /** @class */ (function () {
    function RuleBasedRecommender(config) {
        var _a, _b, _c;
        this.intentCatalog = (_a = config.intentCatalog) !== null && _a !== void 0 ? _a : intentCatalog_1.INTENT_CATALOG;
        this.functionIndex = indexFunctionCatalog(config.functionCatalog);
        this.responseVersion = (_b = config.responseVersion) !== null && _b !== void 0 ? _b : DEFAULT_RESPONSE_VERSION;
        this.resolveAssetIdOverride = config.resolveAssetId;
        var extras = ((_c = config.extraSensitiveKeywords) !== null && _c !== void 0 ? _c : []).map(function (s) { return s.toLowerCase(); });
        this.sensitiveKeywords = __spreadArray(__spreadArray([], BASE_SENSITIVE_KEYWORDS, true), extras, true).map(function (s) { return s.toLowerCase(); });
    }
    RuleBasedRecommender.prototype.recommend = function (userTextRaw, ctx) {
        var _a, _b, _c;
        if (ctx === void 0) { ctx = {}; }
        var userText = normalize(userTextRaw);
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
        var extraction = (0, extractLocoQuery_1.extractLocoQuery)(userTextRaw);
        // 4) Pick best intent (lexical scoring)
        var ranked = rankIntents(userText, this.intentCatalog, this.functionIndex, {
            allowMaintenanceIntents: !!ctx.allowMaintenanceIntents,
        });
        var best = ranked[0];
        if (!best || best.score <= 0) {
            // Not confidently matched: we stay “answer” so we can provide a safe starter call
            return this.answerWithSafeStarter("I’m not sure which specific dashboard question you mean yet. Here’s the safest starting point: fetch the dashboard snapshot, then you can ask a more specific KPI/locomotive question.", [{ functionName: "getDashBoardData", args: {} }], ["value.summary", "value.assetData"], ["Couldn’t confidently match an intent; recommended a safe overview call."]);
        }
        var intentId = best.intentId;
        var intent = this.intentCatalog[intentId];
        if (!intent) {
            return this.error("Internal error: matched an intent that does not exist in the catalog.", [
                "intentId=".concat(intentId),
            ]);
        }
        // 5) Block maintenance intents unless explicitly allowed
        if (intent.safety === "maintenance_only" && !ctx.allowMaintenanceIntents) {
            return this.outOfScope("That action is maintenance-only (side effects) and is blocked in advisor mode.", ["Try asking for the current state/credit/inspection info instead (read-only)."]);
        }
        // 6) Ensure required entities are present (locomotive + other)
        if (intent.requiresLoco) {
            var hasSomeLocoRef = !!extraction.assetId || !!extraction.locoNo || !!extraction.name;
            if (!hasSomeLocoRef) {
                return this.needsFollowup((_a = intent.followUpQuestion) !== null && _a !== void 0 ? _a : "Which locomotive (assetId, loco number, or name)?");
            }
        }
        // 7) Resolve assetId (if possible) using snapshot
        var resolvedAssetId = this.resolveAssetIdIfPossible(extraction, ctx);
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
            var entered = extraction.locoNo ? "loco number \"".concat(extraction.locoNo, "\"") : "name \"".concat(extraction.name, "\"");
            // A) Not fresh -> recommend refresh and stop
            if (ctx.dashboardDataFresh !== true) {
                return this.answerWithSafeStarter("I couldn\u2019t find ".concat(entered, " in the dashboard data I currently have. Please refresh the dashboard snapshot by running getDashBoardData(), then ask again."), [{ functionName: "getDashBoardData", args: {} }], ["value.assetData"], ["AssetId not found from current snapshot; recommended refresh."]);
            }
            // B) Fresh but still not found -> re-check
            return this.needsFollowup("I still can\u2019t find ".concat(entered, " even after a refresh. I don\u2019t have access to that locomotive in the current dashboard data. Please re-check the locomotive number/name, or provide the assetId."));
        }
        // 8) Build recommended calls from intent (enforcing FUNCTION_CATALOG.json)
        var calls = this.buildCalls(intent, resolvedAssetId);
        // 9) If intent needs assetId but we don’t have it, optionally prepend fetch (rare now, because we enforce stop above)
        var finalCalls = this.maybePrependDashboardFetch(intent, calls, resolvedAssetId, ctx, extraction);
        // 10) If after safety filtering we have no calls -> answer safely
        if (finalCalls.length === 0) {
            return this.answerWithSafeStarter("I can’t recommend a safe function for that exact request with the current catalog. Here’s the safest overview call instead.", [{ functionName: "getDashBoardData", args: {} }], ["value.summary", "value.assetData"], ["Intent ".concat(intentId, " produced no recommendable calls after catalog filtering.")]);
        }
        // 11) Sanitize readTheseFields (redaction policy)
        var sanitizedFields = sanitizeReadTheseFields((_b = intent.readTheseFields) !== null && _b !== void 0 ? _b : []);
        // 12) Compose reply text (suggest-only language)
        var replyText = buildReplyText({
            intentId: intentId,
            intent: intent,
            extraction: extraction,
            resolvedAssetId: resolvedAssetId,
            recommendedCalls: finalCalls,
        });
        var notes = [];
        if ((_c = best.debugWhy) === null || _c === void 0 ? void 0 : _c.length)
            notes.push.apply(notes, best.debugWhy);
        if (intent.notes)
            notes.push(intent.notes);
        return __assign(__assign({ version: this.responseVersion, status: "answer", executionPolicy: "suggest_only", replyText: replyText, recommendedCalls: finalCalls }, (sanitizedFields.length ? { readTheseFields: sanitizedFields } : {})), (notes.length ? { notes: notes } : {}));
    };
    /** ---- Response helpers (schema-compliant) ---- */
    RuleBasedRecommender.prototype.needsFollowup = function (question, notes) {
        return __assign({ version: this.responseVersion, status: "needs_followup", executionPolicy: "suggest_only", replyText: "I need one more detail to answer that.", followUpQuestion: question, recommendedCalls: [] }, ((notes === null || notes === void 0 ? void 0 : notes.length) ? { notes: notes } : {}));
    };
    RuleBasedRecommender.prototype.outOfScope = function (reason, notes) {
        return __assign({ version: this.responseVersion, status: "out_of_scope", executionPolicy: "suggest_only", replyText: reason, outOfScopeReason: reason, recommendedCalls: [] }, ((notes === null || notes === void 0 ? void 0 : notes.length) ? { notes: notes } : {}));
    };
    RuleBasedRecommender.prototype.error = function (message, notes) {
        return __assign({ version: this.responseVersion, status: "error", executionPolicy: "suggest_only", replyText: message, recommendedCalls: [] }, ((notes === null || notes === void 0 ? void 0 : notes.length) ? { notes: notes } : {}));
    };
    RuleBasedRecommender.prototype.answerWithSafeStarter = function (replyText, calls, readFields, notes) {
        var safeCalls = this.filterCallsAgainstCatalog(calls);
        var safeReadFields = sanitizeReadTheseFields(readFields !== null && readFields !== void 0 ? readFields : []);
        return __assign(__assign({ version: this.responseVersion, status: "answer", executionPolicy: "suggest_only", replyText: replyText, recommendedCalls: safeCalls }, (safeReadFields.length ? { readTheseFields: safeReadFields } : {})), ((notes === null || notes === void 0 ? void 0 : notes.length) ? { notes: notes } : {}));
    };
    /** ---- Policy checks ---- */
    RuleBasedRecommender.prototype.isSensitiveRequest = function (normalizedUserText) {
        return this.sensitiveKeywords.some(function (kw) { return normalizedUserText.includes(kw); });
    };
    /** ---- Loco resolution ---- */
    RuleBasedRecommender.prototype.resolveAssetIdIfPossible = function (extraction, ctx) {
        // If user gave assetId explicitly, trust it as the identifier (don’t verify here).
        if (extraction.assetId)
            return extraction.assetId;
        if (!ctx.dashboardSnapshot)
            return null;
        // Use custom resolver if provided
        if (this.resolveAssetIdOverride) {
            var out = this.resolveAssetIdOverride({ extraction: extraction, snapshot: ctx.dashboardSnapshot });
            if (!out)
                return null;
            if ("assetId" in out)
                return out.assetId;
            return null; // ambiguous -> unresolved here
        }
        // Default resolver: look in snapshot for locoNo/name fields
        var assetData = extractAssetDataMap(ctx.dashboardSnapshot);
        if (!assetData)
            return null;
        var locoNoNorm = extraction.locoNo ? normalizeLoose(extraction.locoNo) : null;
        var nameNorm = extraction.name ? normalizeLoose(extraction.name) : null;
        var matches = [];
        for (var _i = 0, _a = Object.entries(assetData); _i < _a.length; _i++) {
            var _b = _a[_i], assetId = _b[0], loco = _b[1];
            if (!loco || typeof loco !== "object")
                continue;
            var locoAny = loco;
            var locoNo = typeof locoAny.locoNo === "string" ? locoAny.locoNo : undefined;
            var name_1 = typeof locoAny.name === "string" ? locoAny.name : undefined;
            var locoNoCandidate = locoNo ? normalizeLoose(locoNo) : "";
            var nameCandidate = name_1 ? normalizeLoose(name_1) : "";
            var hit = false;
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
                matches.push({ assetId: assetId, locoNo: locoNo, name: name_1 });
        }
        if (matches.length === 1)
            return matches[0].assetId;
        return null; // 0 or many => unresolved
    };
    /** ---- Call building + catalog enforcement ---- */
    RuleBasedRecommender.prototype.buildCalls = function (intent, resolvedAssetId) {
        var _a;
        var calls = ((_a = intent.recommendedCalls) !== null && _a !== void 0 ? _a : []).map(function (c) {
            var _a;
            var rawArgs = __assign({}, ((_a = c.args) !== null && _a !== void 0 ? _a : {}));
            // Substitute placeholders if we have a resolved value.
            if (resolvedAssetId) {
                for (var _i = 0, _b = Object.entries(rawArgs); _i < _b.length; _i++) {
                    var _c = _b[_i], k = _c[0], v = _c[1];
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
    };
    RuleBasedRecommender.prototype.maybePrependDashboardFetch = function (intent, calls, resolvedAssetId, ctx, extraction) {
        if (!intent.requiresLoco)
            return calls;
        if (resolvedAssetId || extraction.assetId)
            return calls;
        var hasLocoNoOrName = !!extraction.locoNo || !!extraction.name;
        if (!hasLocoNoOrName)
            return calls;
        if (ctx.dashboardSnapshot)
            return calls;
        var shouldRecommendFetch = ctx.dashboardDataFresh === false || ctx.dashboardDataFresh === undefined;
        if (!shouldRecommendFetch)
            return calls;
        var dashCall = { functionName: "getDashBoardData", args: {} };
        var safeDashCall = this.filterCallsAgainstCatalog([dashCall]);
        if (!safeDashCall.length)
            return calls;
        var alreadyHas = calls.some(function (c) { return c.functionName === "getDashBoardData"; });
        return alreadyHas ? calls : dedupeCalls(__spreadArray(__spreadArray([], safeDashCall, true), calls, true));
    };
    RuleBasedRecommender.prototype.filterCallsAgainstCatalog = function (calls) {
        var safe = [];
        for (var _i = 0, calls_1 = calls; _i < calls_1.length; _i++) {
            var call = calls_1[_i];
            var spec = this.functionIndex[call.functionName];
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
    };
    return RuleBasedRecommender;
}());
exports.RuleBasedRecommender = RuleBasedRecommender;
/** ---- Intent ranking (rule-based lexical matching) ---- */
function rankIntents(normalizedUserText, intentCatalog, functionIndex, opts) {
    var _a, _b, _c, _d;
    var tokens = tokenize(normalizedUserText);
    var results = [];
    for (var _i = 0, _e = Object.entries(intentCatalog); _i < _e.length; _i++) {
        var _f = _e[_i], intentId = _f[0], spec = _f[1];
        if (!opts.allowMaintenanceIntents && spec.safety === "maintenance_only")
            continue;
        var why = [];
        var score = 0;
        // 1) triggerPhrases scoring (primary)
        var triggers = ((_a = spec.triggerPhrases) !== null && _a !== void 0 ? _a : []).map(function (t) { return t.toLowerCase(); });
        for (var _g = 0, triggers_1 = triggers; _g < triggers_1.length; _g++) {
            var trig = triggers_1[_g];
            if (!trig)
                continue;
            var trigNorm = normalize(trig);
            if (normalizedUserText.includes(trigNorm)) {
                var w = Math.max(2, trigNorm.length / 4);
                score += w;
                why.push("trigger=\"".concat(trig, "\" (+").concat(w.toFixed(1), ")"));
            }
        }
        // 2) Token overlap heuristic (secondary)
        var triggerTokens = new Set(triggers
            .flatMap(function (t) { return tokenize(t); })
            .filter(function (t) { return t && !STOPWORDS.has(t); }));
        var overlap = 0;
        for (var _h = 0, tokens_1 = tokens; _h < tokens_1.length; _h++) {
            var t = tokens_1[_h];
            if (triggerTokens.has(t))
                overlap++;
        }
        if (overlap) {
            var w = overlap * 0.8;
            score += w;
            why.push("tokenOverlap=".concat(overlap, " (+").concat(w.toFixed(1), ")"));
        }
        // 3) Function tags/aliases (tiny boost)
        var fnNames = ((_b = spec.recommendedCalls) !== null && _b !== void 0 ? _b : []).map(function (c) { return c.function; });
        var fnHints = new Set();
        for (var _j = 0, fnNames_1 = fnNames; _j < fnNames_1.length; _j++) {
            var fn = fnNames_1[_j];
            var f = functionIndex[fn];
            if (!f)
                continue;
            for (var _k = 0, _l = (_c = f.tags) !== null && _c !== void 0 ? _c : []; _k < _l.length; _k++) {
                var tag = _l[_k];
                fnHints.add(tag.toLowerCase());
            }
            for (var _m = 0, _o = (_d = f.aliases) !== null && _d !== void 0 ? _d : []; _m < _o.length; _m++) {
                var a = _o[_m];
                fnHints.add(a.toLowerCase());
            }
        }
        for (var _p = 0, fnHints_1 = fnHints; _p < fnHints_1.length; _p++) {
            var hint = fnHints_1[_p];
            var h = normalize(hint);
            if (h && normalizedUserText.includes(h)) {
                score += 0.6;
                why.push("fnHint=\"".concat(hint, "\" (+0.6)"));
            }
        }
        if (score > 0)
            results.push({ intentId: intentId, score: score, debugWhy: why });
    }
    results.sort(function (a, b) { return b.score - a.score; });
    return results.map(function (r) { return ({ intentId: r.intentId, score: r.score, debugWhy: r.debugWhy }); });
}
/** ---- Reply text builder ---- */
function buildReplyText(input) {
    var intent = input.intent, extraction = input.extraction, resolvedAssetId = input.resolvedAssetId, recommendedCalls = input.recommendedCalls;
    var locoLabel = resolvedAssetId ||
        extraction.assetId ||
        extraction.locoNo ||
        extraction.name ||
        (intent.requiresLoco ? "that locomotive" : null);
    var callList = recommendedCalls.map(function (c) { return c.functionName; }).join(", ");
    if (intent.requiresLoco) {
        return "To answer that for ".concat(locoLabel, ", run: ").concat(callList, ". I\u2019m only recommending the call(s); your app should execute them and show the results.");
    }
    return "To answer that, run: ".concat(callList, ". I\u2019m only recommending the call(s); your app should execute them and show the results.");
}
/** ---- Snapshot extraction ---- */
function extractAssetDataMap(snapshot) {
    if (!snapshot || typeof snapshot !== "object")
        return null;
    var s = snapshot;
    // A) getDashBoardData() result: { value: { assetData: { ... } } }
    var value = s.value;
    if (value && typeof value === "object") {
        var assetData = value.assetData;
        if (assetData && typeof assetData === "object")
            return assetData;
    }
    // B) raw DB snapshot: { data: { locomotives: { ... } } }
    var data = s.data;
    if (data && typeof data === "object") {
        var locos = data.locomotives;
        if (locos && typeof locos === "object")
            return locos;
    }
    // C) direct map
    var keys = Object.keys(s);
    if (keys.length && keys.every(function (k) { return typeof k === "string"; })) {
        return s;
    }
    return null;
}
/** ---- Catalog indexing + args validation ---- */
function indexFunctionCatalog(cat) {
    var _a;
    var idx = {};
    for (var _i = 0, _b = (_a = cat.functions) !== null && _a !== void 0 ? _a : []; _i < _b.length; _i++) {
        var f = _b[_i];
        idx[f.name] = f;
    }
    return idx;
}
function argsPassSchema(args, schema) {
    var _a;
    // If no schema, accept (catalog still enforced by name + recommendable)
    if (!schema)
        return true;
    if (schema.type !== "object")
        return false;
    var required = (_a = schema.required) !== null && _a !== void 0 ? _a : [];
    for (var _i = 0, required_1 = required; _i < required_1.length; _i++) {
        var k = required_1[_i];
        if (!(k in args))
            return false;
        var v = args[k];
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
        var allowed = new Set(Object.keys(schema.properties));
        for (var _b = 0, _c = Object.keys(args); _b < _c.length; _b++) {
            var k = _c[_b];
            if (!allowed.has(k))
                return false;
        }
    }
    return true;
}
/** ---- Redaction: strip any read fields that are forbidden ---- */
function sanitizeReadTheseFields(fields) {
    var forbidden = [
        ".LastInspec.user.email",
        ".LastInspec.user.signature",
        ".LastInspec.user.signature.md5",
        ".LastInspec.user.signature.status",
        ".LastInspec.user.signature.imgName",
        "LastInspec.user.email",
        "LastInspec.user.signature",
    ].map(function (s) { return s.toLowerCase(); });
    return (fields !== null && fields !== void 0 ? fields : []).filter(function (f) {
        var low = String(f).toLowerCase();
        return !forbidden.some(function (x) { return low.includes(x); });
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
        .map(function (t) { return t.trim(); })
        .filter(Boolean)
        .filter(function (t) { return !STOPWORDS.has(t); });
}
function dedupeCalls(calls) {
    var seen = new Set();
    var out = [];
    for (var _i = 0, calls_2 = calls; _i < calls_2.length; _i++) {
        var c = calls_2[_i];
        var key = "".concat(c.functionName, "::").concat(stableStringify(c.args));
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
    var o = obj;
    var keys = Object.keys(o).sort();
    var parts = keys.map(function (k) { return "".concat(k, ":").concat(stableStringify(o[k])); });
    return "{".concat(parts.join(","), "}");
}
function looksLikeWriteRequest(normalizedUserText) {
    return WRITE_INTENT_KEYWORDS.some(function (kw) { return normalizedUserText.includes(kw); });
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
