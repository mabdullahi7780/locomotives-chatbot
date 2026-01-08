// extractLocoQuery.ts
// Implements:
// 1) assetId detection (24-hex)
// 2) loco number detection (3–5 digits) with heuristics
// 3) name detection (e.g., "4430 SD70M", "903 EMD SL-1")
// Also supports extracting MULTIPLE ids/numbers/names.

export type Confidence = "low" | "medium" | "high";
export type RawMatchKind = "assetId" | "locoNo" | "name";

export interface RawMatch {
  kind: RawMatchKind;
  text: string;
  start: number; // start character index in input
  end: number;   // end character index (exclusive)
}

// NOTE: To support "all ids/names are extracted", we return arrays.
// For convenience, we also keep singular fields as "first match".
export interface LocoQuery {
  input: string;

  assetIds: string[];
  locoNos: string[];
  names: string[];

  // convenience (first match)
  assetId?: string;
  locoNo?: string;
  name?: string;

  rawMatches: RawMatch[];
  confidence: Confidence;
}

// ---- Regexes ----
const ASSET_ID_REGEX_GLOBAL = /\b[a-f0-9]{24}\b/gi;

// Phase 1a: keyword + number with various separators (loco 4430, loco:4430, loco no 4430, etc.)
const LOCO_KEYWORD_NUMBER_GLOBAL =
  /\b(loco|locomotive|unit|engine|locos|units|engines)\b(?:\s*(?:no\.?|number)?)\s*[:#\-]?\s*(\d{3,5})\b/gi;

// Phase 1b: concatenated forms (loco4430, unit903)
const LOCO_KEYWORD_NUMBER_CONCAT_GLOBAL =
  /\b(loco|locomotive|unit|engine)(\d{3,5})\b/gi;

// Generic 3–5 digit candidates (filtered by heuristics)
const LOCO_NUMBER_GLOBAL = /\b\d{3,5}\b/g;

// Find numbers that could start a loco name phrase
const LOCO_NUMBER_START_GLOBAL = /\b\d{3,5}\b/g;

// No-space name detection (4430SD70M, 903EMD)
const LOCO_NAME_NOSPACE_GLOBAL = /\b(\d{3,5})([A-Za-z][A-Za-z0-9\-\/]{2,15})\b/g;

// Optional: model tokens like SD70M, AC44C6M, SL-1 (only if near loco keywords)
const MODEL_TOKEN_GLOBAL = /\b[A-Z][A-Z0-9\-\/]{2,15}\b/g;

// Stopwords to avoid treating ordinary words as names/models
const NAME_STOPWORDS: { [key: string]: true } = {
  // Time words
  DAY: true, DAYS: true, TODAY: true, TOMORROW: true, YESTERDAY: true,
  WEEK: true, WEEKS: true, MONTH: true, MONTHS: true, YEAR: true, YEARS: true,
  
  // Inspection related
  INSPECTION: true, INSPECTIONS: true, DUE: true, NEXT: true, DONE: true,
  COMPLETED: true, PENDING: true, OVERDUE: true, SCHEDULED: true,
  
  // Loco keywords (shouldn't be part of a name)
  LOCO: true, LOCOMOTIVE: true, UNIT: true, ENGINE: true, UNITS: true, ENGINES: true,
  
  // Polite words
  PLEASE: true, PLS: true, PLZ: true, THANKS: true, THANK: true, THANKYOU:true,
  
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

function uniq(arr: string[]): string[] {
  const out: string[] = [];
  const seen: { [key: string]: true } = {};
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!seen[v]) {
      seen[v] = true;
      out.push(v);
    }
  }
  return out;
}

function nearKeywords(input: string, start: number, end: number, window = 20): boolean {
  const left = Math.max(0, start - window);
  const right = Math.min(input.length, end + window);
  const ctx = input.slice(left, right).toLowerCase();
  return /\b(loco|locomotive|unit|engine)\b/.test(ctx);
}

function isFollowedByDayish(input: string, end: number): boolean {
  const tail = input.slice(end, Math.min(input.length, end + 10)).toLowerCase();
  // matches: "-day", "-days", " day", " days", "day", "d " (shorthand like 368d)
  return /^(\s*-\s*days?\b|\s+days?\b|-\s*days?\b|d\b|d\s)/.test(tail);
}

function looksLikeYear(n: number): boolean {
  return n >= 1900 && n <= 2099;
}

/**
 * Check if a number looks like a count/limit (e.g., "top 100", "show 50 inspections")
 * These should NOT be treated as loco numbers
 */
function looksLikeCountNumber(input: string, start: number, end: number): boolean {
  const left = input.slice(Math.max(0, start - 20), start).toLowerCase();
  const right = input.slice(end, Math.min(input.length, end + 25)).toLowerCase();

  // "top 100", "first 50", "last 20", "limit 25"
  if (/\b(top|first|last|limit)\s*$/.test(left)) return true;

  // "show 100 inspections", "list 50 locos"
  if (/\b(show|list|display|get|give|find)\s*$/.test(left) &&
      /^\s*(inspections?|locos?|locomotives?|units?|engines?|records?|items?|results?)\b/.test(right)) return true;

  // "number of 100 ...", "count of 50 ..."
  if (/\b(number\s+of|count\s+of)\s*$/.test(left)) return true;

  return false;
}

function isStopword(word: string): boolean {
  return NAME_STOPWORDS[word] === true;
}

/**
 * Check if input has domain-specific context (inspection/due/expiry related)
 * This helps accept plain numbers in clearly relevant prompts
 */
function hasDomainContext(input: string): boolean {
  return /\b(due|overdue|inspection|inspections|expiry|expires|expiring|next|credit|out\s*of\s*use|status|upcoming|schedule|scheduled|pending|completed|history)\b/i.test(input);
}

function forEachMatch(
  input: string,
  regex: RegExp,
  cb: (m: RegExpExecArray) => void
): void {
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(input)) !== null) {
    cb(m);
    if (m[0] === "") regex.lastIndex++;
  }
}

/**
 * Extract ALL assetIds (24-hex) from input.
 */
function extractAssetIds(input: string) {
  const assetIds: string[] = [];
  const matches: RawMatch[] = [];

  forEachMatch(input, ASSET_ID_REGEX_GLOBAL, (m) => {
    const text = m[0];
    const start = m.index != null ? m.index : -1;
    const end = start + text.length;

    assetIds.push(text.toLowerCase());
    matches.push({ kind: "assetId", text, start, end });
  });

  return { assetIds: uniq(assetIds), rawMatches: matches };
}

/**
 * Extract ALL likely loco numbers from input using heuristics:
 * - Prefer numbers near keywords: loco/locomotive/unit/engine
 * - Accept 3–5 digit numbers
 * - Reject numbers followed by "day"/"days" (e.g., 368-day, 368 days, 368d)
 * - STRICTLY reject years (1900–2099) unless explicitly tied to loco keyword in Phase 1
 * - Accept single candidate numbers in domain context (but not years)
 */
function extractLocoNos(input: string) {
  const locoNos: string[] = [];
  const matches: RawMatch[] = [];
  const hasDomain = hasDomainContext(input);

  // Track numbers captured via explicit loco keywords (these are trusted, even years)
  const trustedFromKeyword: { [key: string]: true } = {};

  // Phase 1a: High-precision "keyword + number" with separators
  forEachMatch(input, LOCO_KEYWORD_NUMBER_GLOBAL, (m) => {
    const numText = m[2];
    const full = m[0];
    const fullStart = m.index != null ? m.index : -1;

    const numOffset = full.toLowerCase().lastIndexOf(numText.toLowerCase());
    const start = fullStart + Math.max(0, numOffset);
    const end = start + numText.length;

    if (locoNos.indexOf(numText) < 0) {
      locoNos.push(numText);
      matches.push({ kind: "locoNo", text: numText, start, end });
      trustedFromKeyword[numText] = true;
    }
  });

  // Phase 1b: Concatenated forms (loco4430, unit903)
  forEachMatch(input, LOCO_KEYWORD_NUMBER_CONCAT_GLOBAL, (m) => {
    const numText = m[2];
    const full = m[0];
    const fullStart = m.index != null ? m.index : -1;

    const numOffset = full.toLowerCase().lastIndexOf(numText.toLowerCase());
    const start = fullStart + Math.max(0, numOffset);
    const end = start + numText.length;

    if (locoNos.indexOf(numText) < 0) {
      locoNos.push(numText);
      matches.push({ kind: "locoNo", text: numText, start, end });
      trustedFromKeyword[numText] = true;
    }
  });

  // Phase 2: Generic 3–5 digit candidates with heuristics
  const candidates: Array<{ numText: string; start: number; end: number; score: number }> = [];

  forEachMatch(input, LOCO_NUMBER_GLOBAL, (m) => {
    const numText = m[0];
    const start = m.index != null ? m.index : -1;
    const end = start + numText.length;

    // Skip if already captured in Phase 1
    if (locoNos.indexOf(numText) >= 0) return;

    // Reject "368-day", "368 days", "368d", etc.
    if (isFollowedByDayish(input, end)) return;

    // Reject count/limit numbers ("top 100", "show 50 inspections")
    if (looksLikeCountNumber(input, start, end)) return;

    const num = Number(numText);
    const near = nearKeywords(input, start, end);

    // STRICTLY reject years (1900–2099) in Phase 2
    if (looksLikeYear(num)) return;

    // Scoring heuristic
    let score = 0;

    if (near) score += 2;

    // "#4430" pattern helps
    const before = input.slice(Math.max(0, start - 2), start);
    if (before.indexOf("#") >= 0) score += 1;

    // Domain context booster (but NOT for years - already filtered above)
    if (hasDomain) score += 1;

    candidates.push({ numText, start, end, score });
  });

  // If we have exactly one candidate after filtering, accept it only if score >= 1
  // This prevents accepting bare numbers like "4430" without any context
  // But "When is 4430 due next?" works because hasDomainContext gives score +1
  if (candidates.length === 1 && candidates[0].score >= 1) {
    const c = candidates[0];
    locoNos.push(c.numText);
    matches.push({ kind: "locoNo", text: c.numText, start: c.start, end: c.end });
  } else {
    // Multiple candidates: require minimum score
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (c.score >= 1) {
        locoNos.push(c.numText);
        matches.push({ kind: "locoNo", text: c.numText, start: c.start, end: c.end });
      }
    }
  }

  return { locoNos: uniq(locoNos), rawMatches: matches };
}

/**
 * Extract ALL likely loco "names".
 * Primary: phrases like "4430 SD70M", "903 EMD SL-1", "4430SD70M"
 * Secondary (optional): model tokens like "SD70M" near loco keywords (low precision)
 */
function extractNames(input: string) {
  const names: string[] = [];
  const matches: RawMatch[] = [];

  // Phase 0: No-space name detection (4430SD70M → "4430 SD70M")
  forEachMatch(input, LOCO_NAME_NOSPACE_GLOBAL, (m) => {
    const numPart = m[1];
    const modelPart = m[2];
    const start = m.index != null ? m.index : -1;
    const fullText = m[0];
    const end = start + fullText.length;

    // Validate model part is not a stopword
    if (isStopword(modelPart.toUpperCase())) return;

    // Require model to look "model-ish" (has digit, hyphen, or is all-caps)
    if (!/[0-9\-\/]/.test(modelPart) && !(modelPart.length >= 2 && modelPart === modelPart.toUpperCase())) return;

    // Store normalized version in names array for consistency
    const normalizedPhrase = numPart + " " + modelPart;
    
    if (names.indexOf(normalizedPhrase) >= 0) return;

    names.push(normalizedPhrase);
    // rawMatch.text should match what was actually in the input for accurate debugging
    matches.push({ kind: "name", text: fullText, start, end });
  });

  // Phase 1: Find all numbers, then try to build name phrases from each
  forEachMatch(input, LOCO_NUMBER_START_GLOBAL, (m) => {
    const numText = m[0];
    const start = m.index != null ? m.index : -1;
    
    const afterNum = input.slice(start + numText.length);
    const afterMatch = afterNum.match(/^(\s+[A-Za-z][A-Za-z0-9\-\/]*(?:\s+[A-Za-z0-9][A-Za-z0-9\-\/]*){0,2})/);
    
    if (!afterMatch) return;
    
    const afterText = afterMatch[1];
    let tokens = (numText + afterText).trim().split(/\s+/);
    
    const second = (tokens[1] || "").toUpperCase();
    if (isStopword(second)) return;

    let separatorIndex = -1;
    for (let i = 1; i < tokens.length; i++) {
      if (isStopword(tokens[i].toUpperCase())) {
        separatorIndex = i;
        break;
      }
    }
    if (separatorIndex > 0) {
      tokens = tokens.slice(0, separatorIndex);
    }

    let hasModelish = false;
    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i];
      if (/[0-9\-\/]/.test(t) || (t.length >= 2 && t === t.toUpperCase())) {
        hasModelish = true;
        break;
      }
    }
    if (!hasModelish) return;

    while (tokens.length > 1 && isStopword(tokens[tokens.length - 1].toUpperCase())) {
      tokens.pop();
    }
    if (tokens.length < 2) return;

    const phrase = tokens.join(" ");
    const end = start + phrase.length;

    if (names.indexOf(phrase) >= 0) return;

    names.push(phrase);
    matches.push({ kind: "name", text: phrase, start, end });
  });

  // Phase 2: model tokens (only if near loco keywords, and not obvious stopwords)
  forEachMatch(input, MODEL_TOKEN_GLOBAL, (m) => {
    const token = m[0];
    const start = m.index != null ? m.index : -1;
    const end = start + token.length;

    const upper = token.toUpperCase();
    if (isStopword(upper)) return;
    if (!/[0-9\-\/]/.test(token)) return;
    if (!nearKeywords(input, start, end, 25)) return;

    for (let i = 0; i < names.length; i++) {
      if (names[i].indexOf(token) >= 0) return;
    }

    names.push(token);
    matches.push({ kind: "name", text: token, start, end });
  });

  return { names: uniq(names), rawMatches: matches };
}

function computeConfidence(assetIds: string[], locoNos: string[], names: string[]): Confidence {
  if (assetIds.length > 0) return "high";
  if (locoNos.length > 0) return "medium";
  
  // For names only: check if any name starts with a number (more reliable)
  if (names.length > 0) {
    let hasNumberedName = false;
    for (let i = 0; i < names.length; i++) {
      if (/^\d{3,5}\b/.test(names[i])) {
        hasNumberedName = true;
        break;
      }
    }
    // Model-only names (like "SD70M" without a number) are low confidence
    return hasNumberedName ? "medium" : "low";
  }
  
  return "low";
}

export function extractLocoQuery(input: string): LocoQuery {
  const { assetIds, rawMatches: assetMatches } = extractAssetIds(input);
  const { locoNos, rawMatches: locoMatches } = extractLocoNos(input);
  const { names, rawMatches: nameMatches } = extractNames(input);

  const rawMatches = [...assetMatches, ...locoMatches, ...nameMatches]
    .sort((a, b) => a.start - b.start);

  const confidence = computeConfidence(assetIds, locoNos, names);

  return {
    input,
    assetIds,
    locoNos,
    names,
    assetId: assetIds[0],
    locoNo: locoNos[0],
    name: names[0],
    rawMatches,
    confidence,
  };
}
