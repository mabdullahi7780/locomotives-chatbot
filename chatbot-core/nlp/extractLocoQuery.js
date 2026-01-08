"use strict";
// extractLocoQuery.ts
// Implements:
// 1) assetId detection (24-hex)
// 2) loco number detection (3–5 digits) with heuristics
// 3) name detection (e.g., "4430 SD70M", "903 EMD SL-1")
// Also supports extracting MULTIPLE ids/numbers/names.
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
exports.extractLocoQuery = extractLocoQuery;
// ---- Regexes (no /g state bugs with exec) ----
var ASSET_ID_REGEX_GLOBAL = /\b[a-f0-9]{24}\b/gi;
// Prefer explicit keyword forms first (highest precision for loco numbers)
var LOCO_KEYWORD_NUMBER_GLOBAL = /\b(loco|locomotive|unit|engine)\b\s*#?\s*(\d{3,5})\b/gi;
// Generic 3–5 digit candidates (filtered by heuristics)
var LOCO_NUMBER_GLOBAL = /\b\d{3,5}\b/g;
// Find numbers that could start a loco name phrase
var LOCO_NUMBER_START_GLOBAL = /\b\d{3,5}\b/g;
// Optional: model tokens like SD70M, AC44C6M, SL-1 (only if near loco keywords)
var MODEL_TOKEN_GLOBAL = /\b[A-Z][A-Z0-9\-\/]{2,15}\b/g;
// Stopwords to avoid treating ordinary words as names/models
var NAME_STOPWORDS = {
    // Time words
    DAY: true, DAYS: true, TODAY: true, TOMORROW: true, YESTERDAY: true,
    WEEK: true, WEEKS: true, MONTH: true, MONTHS: true, YEAR: true, YEARS: true,
    // Inspection related
    INSPECTION: true, INSPECTIONS: true, DUE: true, NEXT: true, DONE: true,
    COMPLETED: true, PENDING: true, OVERDUE: true, SCHEDULED: true,
    // Loco keywords (shouldn't be part of a name)
    LOCO: true, LOCOMOTIVE: true, UNIT: true, ENGINE: true, UNITS: true, ENGINES: true,
    // Polite words
    PLEASE: true, PLS: true, PLZ: true, THANKS: true, THANK: true,
    // Conjunctions/Separators
    WITH: true, AND: true, VS: true, OR: true, COMPARED: true, TO: true,
    FOR: true, FROM: true, BY: true, AT: true, ON: true, OF: true,
    // Common verbs/words that won't be model names
    IN: true, IS: true, ARE: true, WAS: true, WERE: true, BE: true, BEEN: true,
    THE: true, A: true, AN: true, THIS: true, THAT: true, THESE: true, THOSE: true,
    HOW: true, WHAT: true, WHEN: true, WHERE: true, WHY: true, WHO: true, WHICH: true,
    CAN: true, COULD: true, WILL: true, WOULD: true, SHOULD: true, MAY: true, MIGHT: true,
    DO: true, DOES: true, DID: true, HAVE: true, HAS: true, HAD: true,
    GET: true, FIND: true, SHOW: true, LIST: true, GIVE: true, TELL: true,
};
function uniq(arr) {
    var out = [];
    var seen = {};
    for (var i = 0; i < arr.length; i++) {
        var v = arr[i];
        if (!seen[v]) {
            seen[v] = true;
            out.push(v);
        }
    }
    return out;
}
function nearKeywords(input, start, end, window) {
    if (window === void 0) { window = 20; }
    var left = Math.max(0, start - window);
    var right = Math.min(input.length, end + window);
    var ctx = input.slice(left, right).toLowerCase();
    return /\b(loco|locomotive|unit|engine)\b/.test(ctx);
}
function isFollowedByDayish(input, end) {
    var tail = input.slice(end, Math.min(input.length, end + 10)).toLowerCase();
    return /^(\s*-\s*days?\b|\s+days?\b|-\s*days?\b)/.test(tail);
}
function looksLikeYear(n) {
    return n >= 1900 && n <= 2099;
}
function isStopword(word) {
    return NAME_STOPWORDS[word] === true;
}
function forEachMatch(input, regex, cb) {
    regex.lastIndex = 0;
    var m;
    while ((m = regex.exec(input)) !== null) {
        cb(m);
        // Prevent infinite loops on zero-length matches
        if (m[0] === "")
            regex.lastIndex++;
    }
}
/**
 * Extract ALL assetIds (24-hex) from input.
 */
function extractAssetIds(input) {
    var assetIds = [];
    var matches = [];
    forEachMatch(input, ASSET_ID_REGEX_GLOBAL, function (m) {
        var text = m[0];
        var start = m.index != null ? m.index : -1;
        var end = start + text.length;
        assetIds.push(text.toLowerCase());
        matches.push({ kind: "assetId", text: text, start: start, end: end });
    });
    return { assetIds: uniq(assetIds), rawMatches: matches };
}
/**
 * Extract ALL likely loco numbers from input using heuristics:
 * - Prefer numbers near keywords: loco/locomotive/unit/engine
 * - Accept 3–5 digit numbers
 * - Reject numbers followed by "day"/"days" (e.g., 368-day, 368 days)
 * - Avoid random years (1900–2099) unless near keywords
 */
function extractLocoNos(input) {
    var locoNos = [];
    var matches = [];
    // Phase 1: High-precision "keyword + number"
    forEachMatch(input, LOCO_KEYWORD_NUMBER_GLOBAL, function (m) {
        var numText = m[2];
        var full = m[0];
        var fullStart = m.index != null ? m.index : -1;
        // Find exact indices for the number inside the full match
        var numOffset = full.toLowerCase().lastIndexOf(numText.toLowerCase());
        var start = fullStart + Math.max(0, numOffset);
        var end = start + numText.length;
        locoNos.push(numText);
        matches.push({ kind: "locoNo", text: numText, start: start, end: end });
    });
    // Phase 2: Generic 3–5 digit candidates with heuristics
    forEachMatch(input, LOCO_NUMBER_GLOBAL, function (m) {
        var numText = m[0];
        var start = m.index != null ? m.index : -1;
        var end = start + numText.length;
        // Skip if already captured
        if (locoNos.indexOf(numText) >= 0)
            return;
        // Reject "368-day", "368 days", etc.
        if (isFollowedByDayish(input, end))
            return;
        var num = Number(numText);
        var near = nearKeywords(input, start, end);
        // Reject years unless near loco keywords
        if (looksLikeYear(num) && !near)
            return;
        // Scoring heuristic
        var score = 0;
        if (near)
            score += 2;
        // "#4430" pattern helps (look behind a bit)
        var before = input.slice(Math.max(0, start - 2), start);
        if (before.indexOf("#") >= 0)
            score += 1;
        // If nothing suggests it's a loco number, keep it conservative
        if (score < 1)
            return;
        locoNos.push(numText);
        matches.push({ kind: "locoNo", text: numText, start: start, end: end });
    });
    return { locoNos: uniq(locoNos), rawMatches: matches };
}
/**
 * Extract ALL likely loco "names".
 * Primary: phrases like "4430 SD70M", "903 EMD SL-1"
 * Secondary (optional): model tokens like "SD70M" near loco keywords (low precision)
 */
function extractNames(input) {
    var names = [];
    var matches = [];
    // Phase 1: Find all numbers, then try to build name phrases from each
    forEachMatch(input, LOCO_NUMBER_START_GLOBAL, function (m) {
        var numText = m[0];
        var start = m.index != null ? m.index : -1;
        // Get the text after this number
        var afterNum = input.slice(start + numText.length);
        // Try to match model-ish tokens after the number
        // Pattern: optional whitespace, then up to 3 tokens that look like model names
        var afterMatch = afterNum.match(/^(\s+[A-Za-z][A-Za-z0-9\-\/]*(?:\s+[A-Za-z0-9][A-Za-z0-9\-\/]*){0,2})/);
        if (!afterMatch)
            return;
        var afterText = afterMatch[1];
        var tokens = (numText + afterText).trim().split(/\s+/);
        // Filter: second token must not be a stopword
        var second = (tokens[1] || "").toUpperCase();
        if (isStopword(second))
            return;
        // Truncate at separator words (with, and, vs, or, compared, to)
        var separatorIndex = -1;
        for (var i = 1; i < tokens.length; i++) {
            if (isStopword(tokens[i].toUpperCase())) {
                separatorIndex = i;
                break;
            }
        }
        if (separatorIndex > 0) {
            tokens = tokens.slice(0, separatorIndex);
        }
        // Require at least one model-ish token (digit, hyphen/slash, or all-caps >= 2)
        var hasModelish = false;
        for (var i = 1; i < tokens.length; i++) {
            var t = tokens[i];
            if (/[0-9\-\/]/.test(t) || (t.length >= 2 && t === t.toUpperCase())) {
                hasModelish = true;
                break;
            }
        }
        if (!hasModelish)
            return;
        // Trim trailing stopwords/polite words (e.g., "please")
        while (tokens.length > 1 && isStopword(tokens[tokens.length - 1].toUpperCase())) {
            tokens.pop();
        }
        if (tokens.length < 2)
            return;
        var phrase = tokens.join(" ");
        var end = start + phrase.length;
        // Avoid duplicates
        if (names.indexOf(phrase) >= 0)
            return;
        names.push(phrase);
        matches.push({ kind: "name", text: phrase, start: start, end: end });
    });
    // Phase 2: model tokens (only if near loco keywords, and not obvious stopwords)
    forEachMatch(input, MODEL_TOKEN_GLOBAL, function (m) {
        var token = m[0];
        var start = m.index != null ? m.index : -1;
        var end = start + token.length;
        var upper = token.toUpperCase();
        if (isStopword(upper))
            return;
        // require it to look "model-ish": contains a digit OR a hyphen/slash
        if (!/[0-9\-\/]/.test(token))
            return;
        // only accept if near loco keywords
        if (!nearKeywords(input, start, end, 25))
            return;
        // avoid duplicates if already included inside a bigger phrase
        for (var i = 0; i < names.length; i++) {
            if (names[i].indexOf(token) >= 0)
                return;
        }
        names.push(token);
        matches.push({ kind: "name", text: token, start: start, end: end });
    });
    return { names: uniq(names), rawMatches: matches };
}
function computeConfidence(assetIds, locoNos, names) {
    if (assetIds.length > 0)
        return "high";
    if (locoNos.length > 0 || names.length > 0)
        return "medium";
    return "low";
}
function extractLocoQuery(input) {
    var _a = extractAssetIds(input), assetIds = _a.assetIds, assetMatches = _a.rawMatches;
    var _b = extractLocoNos(input), locoNos = _b.locoNos, locoMatches = _b.rawMatches;
    var _c = extractNames(input), names = _c.names, nameMatches = _c.rawMatches;
    var rawMatches = __spreadArray(__spreadArray(__spreadArray([], assetMatches, true), locoMatches, true), nameMatches, true).sort(function (a, b) { return a.start - b.start; });
    var confidence = computeConfidence(assetIds, locoNos, names);
    return {
        input: input,
        assetIds: assetIds,
        locoNos: locoNos,
        names: names,
        assetId: assetIds[0],
        locoNo: locoNos[0],
        name: names[0],
        rawMatches: rawMatches,
        confidence: confidence,
    };
}
