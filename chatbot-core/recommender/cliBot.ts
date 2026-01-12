#!/usr/bin/env node
/**
 * cliBot.ts - Interactive CLI for testing the BM25 NLP-based Dashboard Advisor
 * 
 * COMPLETE PIPELINE:
 * 1. User input → Raw text query
 * 2. extractLocoQuery() → Extract assetId, locoNumber, locoName from query
 * 3. BM25 intent matching → Classify intent from intentCatalog
 * 4. ruleBasedRecommender.recommend() → Generate ChatResponse with function calls
 * 5. CatalogGuard.guard() → Validate functions, args, safety rules
 * 6. FieldGuard.guard() → Validate fields, block sensitive data
 * 7. Output → Final guarded ChatResponse
 */

import * as readline from "readline";
import type { ChatResponse } from "../contracts";

// Import guards and their types
import { CatalogGuard, type FunctionCatalogJson, type PropertySchema } from "../guards/catalogGuard";
import { FieldGuard } from "../guards/fieldGurad";

// ============================================================================
// INLINE BM25 IMPLEMENTATION (since we can't add new files)
// ============================================================================

interface BM25Document {
  id: string;
  tokens: string[];
  originalText: string;
}

interface BM25SearchResult {
  id: string;
  score: number;
  originalText: string;
}

class BM25Index {
  private documents: BM25Document[] = [];
  private avgDocLength = 0;
  private docFrequency: Map<string, number> = new Map();
  private k1 = 1.5;
  private b = 0.75;

  addDocument(id: string, text: string): void {
    const tokens = this.tokenize(text);
    this.documents.push({ id, tokens, originalText: text });
    
    // Update document frequency
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      this.docFrequency.set(token, (this.docFrequency.get(token) || 0) + 1);
    }
    
    // Update average document length
    const totalLength = this.documents.reduce((sum, doc) => sum + doc.tokens.length, 0);
    this.avgDocLength = totalLength / this.documents.length;
  }

  search(query: string, topK = 5): BM25SearchResult[] {
    const queryTokens = this.tokenize(query);
    const scores: Array<{ id: string; score: number; originalText: string }> = [];
    const N = this.documents.length;

    for (const doc of this.documents) {
      let score = 0;
      const docLength = doc.tokens.length;
      const termFrequency = this.getTermFrequency(doc.tokens);

      for (const term of queryTokens) {
        const tf = termFrequency.get(term) || 0;
        const df = this.docFrequency.get(term) || 0;
        
        if (tf === 0 || df === 0) continue;

        // IDF calculation
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
        
        // BM25 score for this term
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));
        
        score += idf * (numerator / denominator);
      }

      if (score > 0) {
        scores.push({ id: doc.id, score, originalText: doc.originalText });
      }
    }

    // Sort by score descending and return top K
    return scores.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1);
  }

  private getTermFrequency(tokens: string[]): Map<string, number> {
    const freq = new Map<string, number>();
    for (const token of tokens) {
      freq.set(token, (freq.get(token) || 0) + 1);
    }
    return freq;
  }
}

// ============================================================================
// INLINE INTENT CATALOG (from intents/intentCatalog.ts patterns)
// ============================================================================

interface IntentDefinition {
  id: string;
  canonicalExamples: string[];
  functionName: string;
  requiresLocoId: boolean;
  tags: string[];
}

const INTENT_CATALOG: IntentDefinition[] = [
  // Dashboard overview
  {
    id: "dashboard_overview",
    canonicalExamples: [
      "show me the dashboard",
      "give me an overview",
      "what is the fleet status",
      "show fleet summary",
      "dashboard summary",
      "how many locomotives are there",
      "total locomotives",
      "fleet overview",
    ],
    functionName: "getDashBoardData",
    requiresLocoId: false,
    tags: ["dashboard", "overview", "fleet", "summary"],
  },
  // Out of service queries
  {
    id: "out_of_service_list",
    canonicalExamples: [
      "which locomotives are out of service",
      "show out of service locomotives",
      "list oos locomotives",
      "what locos are down",
      "locomotives not in service",
      "which units are out",
      "show me units that are out of service",
    ],
    functionName: "getDashBoardData",
    requiresLocoId: false,
    tags: ["oos", "out-of-service", "status"],
  },
  {
    id: "out_of_service_count",
    canonicalExamples: [
      "how many locomotives are out of service",
      "count of oos locomotives",
      "number of locomotives out of service",
      "how many units are down",
    ],
    functionName: "getDashBoardData",
    requiresLocoId: false,
    tags: ["oos", "count", "summary"],
  },
  // Specific locomotive status
  {
    id: "loco_status",
    canonicalExamples: [
      "what is the status of locomotive",
      "show status of loco",
      "is locomotive in service",
      "check status of unit",
      "locomotive status",
      "get locomotive details",
    ],
    functionName: "getLocoAssetDetails",
    requiresLocoId: true,
    tags: ["status", "locomotive", "details"],
  },
  // Inspection queries
  {
    id: "loco_last_inspection",
    canonicalExamples: [
      "when was the last inspection",
      "show last inspection for locomotive",
      "last inspection date",
      "when was locomotive last inspected",
      "most recent inspection",
      "previous inspection",
    ],
    functionName: "getLocoAssetDetails",
    requiresLocoId: true,
    tags: ["inspection", "last", "history"],
  },
  {
    id: "loco_next_inspection",
    canonicalExamples: [
      "when is the next inspection due",
      "next inspection date",
      "upcoming inspection",
      "when is inspection due",
      "next due inspection",
      "inspection due date",
    ],
    functionName: "getLocoNextDueLocoInspection",
    requiresLocoId: true,
    tags: ["inspection", "next", "due"],
  },
  {
    id: "inspections_due_soon",
    canonicalExamples: [
      "which locomotives have inspections due soon",
      "upcoming inspections",
      "inspections due this week",
      "what inspections are coming up",
      "locomotives needing inspection",
    ],
    functionName: "getDashBoardData",
    requiresLocoId: false,
    tags: ["inspection", "due", "upcoming", "list"],
  },
  // OOS date queries
  {
    id: "loco_oos_date",
    canonicalExamples: [
      "when did locomotive go out of service",
      "when was loco taken out of service",
      "oos date for locomotive",
      "when did unit go down",
      "out of service date",
      "when did it go oos",
    ],
    functionName: "getLocoAssetDetails",
    requiresLocoId: true,
    tags: ["oos", "date", "history"],
  },
  // Defects
  {
    id: "loco_defects",
    canonicalExamples: [
      "what defects does locomotive have",
      "show defects for loco",
      "list defects",
      "any defects on locomotive",
      "defect list",
      "locomotive problems",
    ],
    functionName: "getLocoDefects",
    requiresLocoId: true,
    tags: ["defects", "problems", "issues"],
  },
  // Location
  {
    id: "loco_location",
    canonicalExamples: [
      "where is locomotive",
      "locomotive location",
      "current location of loco",
      "where is unit located",
      "find locomotive",
    ],
    functionName: "getLocoAssetDetails",
    requiresLocoId: true,
    tags: ["location", "where", "find"],
  },
  // Inspector queries
  {
    id: "loco_inspector",
    canonicalExamples: [
      "who inspected locomotive",
      "who did the last inspection",
      "inspector name",
      "who checked the locomotive",
      "last inspector",
    ],
    functionName: "getLocoAssetDetails",
    requiresLocoId: true,
    tags: ["inspector", "who", "person"],
  },
];

// ============================================================================
// INLINE LOCO QUERY EXTRACTION (from nlp/extractLocoQuery.ts)
// ============================================================================

interface LocoQueryResult {
  assetIds: string[];
  locoNumbers: string[];
  locoNames: string[];
  rawQuery: string;
  cleanedQuery: string;
}

function extractLocoQuery(query: string, dashboardSnapshot?: unknown): LocoQueryResult {
  const result: LocoQueryResult = {
    assetIds: [],
    locoNumbers: [],
    locoNames: [],
    rawQuery: query,
    cleanedQuery: query,
  };

  // 1. Extract 24-char hex asset IDs
  const assetIdPattern = /\b[a-f0-9]{24}\b/gi;
  const assetIdMatches = query.match(assetIdPattern);
  if (assetIdMatches) {
    result.assetIds = [...new Set(assetIdMatches.map((id) => id.toLowerCase()))];
    result.cleanedQuery = result.cleanedQuery.replace(assetIdPattern, " ").trim();
  }

  // 2. Extract loco numbers (3-5 digit numbers, with heuristics)
  // Avoid matching years (1900-2099) or common non-loco numbers
  const locoNumberPattern = /\b(\d{3,5})\b/g;
  let match;
  const potentialLocoNumbers: string[] = [];
  
  while ((match = locoNumberPattern.exec(query)) !== null) {
    const num = match[1];
    const numVal = parseInt(num, 10);
    
    // Skip years (1900-2099)
    if (numVal >= 1900 && numVal <= 2099) continue;
    // Skip very small numbers that are likely not loco numbers
    if (numVal < 100) continue;
    
    potentialLocoNumbers.push(num);
  }
  
  result.locoNumbers = [...new Set(potentialLocoNumbers)];

  // 3. Try to resolve loco numbers to assetIds from snapshot
  if (dashboardSnapshot && result.locoNumbers.length > 0) {
    const snap = dashboardSnapshot as Record<string, unknown>;
    const data = snap.data as Record<string, unknown> | undefined;
    const locomotives = data?.locomotives as Record<string, Record<string, unknown>> | undefined;
    
    if (locomotives) {
      for (const locoNum of result.locoNumbers) {
        for (const [assetId, loco] of Object.entries(locomotives)) {
          const locoNo = String(loco.locoNo || "");
          if (locoNo === locoNum && !result.assetIds.includes(assetId)) {
            result.assetIds.push(assetId);
          }
        }
      }
    }
  }

  // 4. Extract potential loco names (e.g., "4430 SD70M")
  const locoNamePattern = /\b(\d{3,5}\s+[A-Z]{2,}[\w-]*)\b/gi;
  const nameMatches = query.match(locoNamePattern);
  if (nameMatches) {
    result.locoNames = [...new Set(nameMatches)];
  }

  // Clean up the query for intent matching (remove loco identifiers)
  for (const num of result.locoNumbers) {
    result.cleanedQuery = result.cleanedQuery.replace(new RegExp(`\\b${num}\\b`, "g"), " ");
  }
  result.cleanedQuery = result.cleanedQuery.replace(/\s+/g, " ").trim();

  return result;
}

// ============================================================================
// LOAD FUNCTION CATALOG
// ============================================================================

// Load function catalog with proper typing
let functionCatalog: FunctionCatalogJson;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  functionCatalog = require("./../../docs/FUNCTION_CATALOG.json") as FunctionCatalogJson;
  console.log("✅ Loaded FUNCTION_CATALOG.json");
} catch (err) {
  console.error("❌ Failed to load FUNCTION_CATALOG.json:", (err as Error).message);
  console.log("Creating minimal catalog...");
  functionCatalog = {
    version: "1.0",
    functions: [
      {
        name: "getDashBoardData",
        recommendable: true,
        readOnly: true,
        tags: ["dashboard", "overview", "fleet"],
        returns: {
          readTheseFields: [
            "value.summary.totalLocomotives",
            "value.summary.locomotivesInService",
            "value.summary.locomotivesOutOfService",
          ],
        },
      },
      {
        name: "getLocoAssetDetails",
        recommendable: true,
        readOnly: true,
        tags: ["locomotive", "details", "status"],
        argsSchema: {
          type: "object",
          required: ["assetId"],
          properties: { 
            assetId: { type: "string" } as PropertySchema,
          },
        },
        returns: {
          readTheseFields: [
            "locoNo",
            "name",
            "status",
            "location",
            "LastInspec.user.name",
            "LastInspec.date",
          ],
        },
      },
      {
        name: "getLocoNextDueLocoInspection",
        recommendable: true,
        readOnly: true,
        tags: ["inspection", "next", "due"],
        argsSchema: {
          type: "object",
          required: ["assetId"],
          properties: { 
            assetId: { type: "string" } as PropertySchema,
          },
        },
        returns: {
          readTheseFields: ["nextExpiryDate", "inspectionType"],
        },
      },
      {
        name: "getLocoDefects",
        recommendable: true,
        readOnly: true,
        tags: ["defects", "problems"],
        argsSchema: {
          type: "object",
          required: ["assetId"],
          properties: { 
            assetId: { type: "string" } as PropertySchema,
          },
        },
        returns: {
          readTheseFields: ["defects"],
        },
      },
    ],
  };
}

// ============================================================================
// LOAD DASHBOARD SNAPSHOT
// ============================================================================

let dashboardSnapshot: unknown = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const raw = require("./../../../dashBoardDataJSON.js");
  dashboardSnapshot = raw.default ?? raw;
  console.log("✅ Loaded dashBoardDataJSON.js");

  if (dashboardSnapshot && typeof dashboardSnapshot === "object") {
    const snap = dashboardSnapshot as Record<string, unknown>;
    if (snap.data && typeof snap.data === "object") {
      const data = snap.data as Record<string, unknown>;
      if (data.locomotives && typeof data.locomotives === "object") {
        const locos = data.locomotives as Record<string, unknown>;
        console.log(`   Found ${Object.keys(locos).length} locomotives`);
      }
    }
  }
} catch (err) {
  console.log("⚠️  dashBoardDataJSON.js not found - loco resolution disabled");
}

// ============================================================================
// BUILD BM25 INDEX FROM INTENT CATALOG
// ============================================================================

const intentIndex = new BM25Index();

for (const intent of INTENT_CATALOG) {
  // Add all canonical examples to the index
  for (const example of intent.canonicalExamples) {
    intentIndex.addDocument(intent.id, example);
  }
  // Also add tags as a pseudo-document
  intentIndex.addDocument(intent.id, intent.tags.join(" "));
}

console.log(`✅ Built BM25 index with ${INTENT_CATALOG.length} intents`);

// ============================================================================
// INITIALIZE GUARDS
// ============================================================================

const catalogGuard = new CatalogGuard({
  catalog: functionCatalog,
  safeMode: true,
  responseVersion: "1.0",
});

// FieldGuard needs a slightly different catalog shape - create compatible one
const fieldGuardCatalog = {
  version: functionCatalog.version,
  functions: functionCatalog.functions.map((fn) => ({
    name: fn.name,
    recommendable: fn.recommendable,
    readOnly: fn.readOnly,
    returns: fn.returns,
  })),
};

const fieldGuard = new FieldGuard({
  catalog: fieldGuardCatalog,
  safeMode: true,
  allowInspectorId: false,
  responseVersion: "1.0",
});

console.log("✅ Initialized CatalogGuard and FieldGuard (safeMode=true)");

// ============================================================================
// MAIN RECOMMENDATION FUNCTION
// ============================================================================

interface RecommendOptions {
  dashboardSnapshot?: unknown;
  dashboardDataFresh?: boolean;
  debugMode?: boolean;
}

interface PipelineDebug {
  step1_locoQuery: LocoQueryResult;
  step2_bm25Results: BM25SearchResult[];
  step3_matchedIntent: IntentDefinition | null;
  step3_bm25Score: number;
  step4_rawResponse: ChatResponse;
  step5_catalogGuardResult: { valid: boolean; errors: unknown[] };
  step6_fieldGuardResult: { valid: boolean; errors: unknown[] };
  step7_finalResponse: ChatResponse;
}

function recommend(
  query: string,
  options: RecommendOptions = {},
): { response: ChatResponse; debug?: PipelineDebug } {
  const debug: PipelineDebug = {
    step1_locoQuery: null!,
    step2_bm25Results: [],
    step3_matchedIntent: null,
    step3_bm25Score: 0,
    step4_rawResponse: null!,
    step5_catalogGuardResult: { valid: true, errors: [] },
    step6_fieldGuardResult: { valid: true, errors: [] },
    step7_finalResponse: null!,
  };

  // -------------------------------------------------------------------------
  // STEP 1: Extract loco query (assetId, locoNumber, locoName)
  // -------------------------------------------------------------------------
  const locoQuery = extractLocoQuery(query, options.dashboardSnapshot);
  debug.step1_locoQuery = locoQuery;

  // -------------------------------------------------------------------------
  // STEP 2: BM25 intent matching
  // -------------------------------------------------------------------------
  const bm25Results = intentIndex.search(locoQuery.cleanedQuery, 5);
  debug.step2_bm25Results = bm25Results;

  // Get the top intent (if score is above threshold)
  const SCORE_THRESHOLD = 0.5;
  let matchedIntent: IntentDefinition | null = null;
  let bm25Score = 0;
  
  if (bm25Results.length > 0 && bm25Results[0].score >= SCORE_THRESHOLD) {
    const topIntentId = bm25Results[0].id;
    matchedIntent = INTENT_CATALOG.find((i) => i.id === topIntentId) || null;
    bm25Score = bm25Results[0].score;
  }
  debug.step3_matchedIntent = matchedIntent;
  debug.step3_bm25Score = bm25Score;

  // -------------------------------------------------------------------------
  // STEP 3: Build ChatResponse based on intent
  // -------------------------------------------------------------------------
  let rawResponse: ChatResponse;

  // Check if dashboard data is fresh (for dashboard queries)
  const dashboardFresh = options.dashboardDataFresh ?? !!options.dashboardSnapshot;

  if (!matchedIntent) {
    // No intent matched - ask for clarification
    rawResponse = {
      version: "1.0",
      status: "needs_followup",
      executionPolicy: "suggest_only",
      replyText: "I'm not sure what you're asking. Could you rephrase your question?",
      recommendedCalls: [],
      followUpQuestion: "Try asking about dashboard overview, locomotive status, inspections, or out-of-service units.",
      notes: ["BM25: No intent matched above threshold"],
    };
  } else if (matchedIntent.requiresLocoId && locoQuery.assetIds.length === 0 && locoQuery.locoNumbers.length === 0) {
    // Intent requires loco ID but none provided
    rawResponse = {
      version: "1.0",
      status: "needs_followup",
      executionPolicy: "suggest_only",
      replyText: `To ${getIntentDescription(matchedIntent)}, I need a locomotive number or ID.`,
      recommendedCalls: [],
      followUpQuestion: "Please provide a locomotive number (e.g., 8304) or asset ID.",
      notes: [`Intent "${matchedIntent.id}" requires locoId but none found in query`],
    };
  } else {
    // Build the function call
    const fnSpec = functionCatalog.functions.find((f) => f.name === matchedIntent.functionName);
    
    if (!fnSpec) {
      // Function not in catalog (shouldn't happen with proper config)
      rawResponse = {
        version: "1.0",
        status: "error",
        executionPolicy: "suggest_only",
        replyText: "I can't process that request right now.",
        recommendedCalls: [],
        notes: [`Function "${matchedIntent.functionName}" not found in catalog`],
      };
    } else {
      // Build the call with appropriate args
      const args: Record<string, unknown> = {};
      
      if (matchedIntent.requiresLocoId) {
        // Use first available identifier
        if (locoQuery.assetIds.length > 0) {
          args.assetId = locoQuery.assetIds[0];
        } else if (locoQuery.locoNumbers.length > 0) {
          // If we have locoNumber but no assetId, we need to note this
          args.locoNumber = locoQuery.locoNumbers[0];
        }
      }

      // Get readTheseFields from catalog
      const readTheseFields = fnSpec.returns?.readTheseFields ?? [];

      rawResponse = {
        version: "1.0",
        status: "answer",
        executionPolicy: "suggest_only",
        replyText: getReplyText(matchedIntent, locoQuery, dashboardFresh),
        recommendedCalls: [
          {
            functionName: matchedIntent.functionName,
            args,
            // Note: confidence is stored in debug, not in CallSpec
          },
        ],
        readTheseFields,
        notes: [
          `Intent: ${matchedIntent.id}`,
          `BM25 score: ${bm25Score.toFixed(3)}`,
        ],
      };
    }
  }
  debug.step4_rawResponse = rawResponse;

  // -------------------------------------------------------------------------
  // STEP 4: CatalogGuard validation
  // -------------------------------------------------------------------------
  const catalogResult = catalogGuard.guard(rawResponse);
  debug.step5_catalogGuardResult = {
    valid: catalogResult.valid,
    errors: catalogResult.errors,
  };

  let guardedResponse = catalogResult.response;

  // -------------------------------------------------------------------------
  // STEP 5: FieldGuard validation (only if catalog guard passed)
  // -------------------------------------------------------------------------
  if (catalogResult.valid) {
    const fieldResult = fieldGuard.guard(guardedResponse);
    debug.step6_fieldGuardResult = {
      valid: fieldResult.valid,
      errors: fieldResult.errors,
    };
    guardedResponse = fieldResult.response;
  }

  debug.step7_finalResponse = guardedResponse;

  return {
    response: guardedResponse,
    debug: options.debugMode ? debug : undefined,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getIntentDescription(intent: IntentDefinition): string {
  const descriptions: Record<string, string> = {
    dashboard_overview: "show the dashboard overview",
    out_of_service_list: "list out-of-service locomotives",
    out_of_service_count: "count out-of-service locomotives",
    loco_status: "check locomotive status",
    loco_last_inspection: "show last inspection details",
    loco_next_inspection: "show next inspection due date",
    inspections_due_soon: "list upcoming inspections",
    loco_oos_date: "check when locomotive went out of service",
    loco_defects: "list locomotive defects",
    loco_location: "find locomotive location",
    loco_inspector: "identify the inspector",
  };
  return descriptions[intent.id] || intent.id.replace(/_/g, " ");
}

function getReplyText(
  intent: IntentDefinition,
  locoQuery: LocoQueryResult,
  dashboardFresh: boolean,
): string {
  const locoRef = locoQuery.locoNumbers[0] || locoQuery.assetIds[0] || "the locomotive";

  const replies: Record<string, string> = {
    dashboard_overview: dashboardFresh
      ? "Here's the current dashboard overview."
      : "I'll fetch the latest dashboard data for you.",
    out_of_service_list: "Here are the locomotives currently out of service.",
    out_of_service_count: "Here's the count of locomotives out of service.",
    loco_status: `Here's the current status of locomotive ${locoRef}.`,
    loco_last_inspection: `Here's the last inspection information for locomotive ${locoRef}.`,
    loco_next_inspection: `Here's when the next inspection is due for locomotive ${locoRef}.`,
    inspections_due_soon: "Here are the upcoming inspections.",
    loco_oos_date: `Here's when locomotive ${locoRef} went out of service.`,
    loco_defects: `Here are the defects for locomotive ${locoRef}.`,
    loco_location: `Here's the current location of locomotive ${locoRef}.`,
    loco_inspector: `Here's who inspected locomotive ${locoRef}.`,
  };

  return replies[intent.id] || "Here's the information you requested.";
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

let debugMode = false;
let dashboardDataFresh = !!dashboardSnapshot;

// Print startup info
console.log("\n========================================");
console.log("  Dashboard Advisor Bot (CLI)");
console.log("  BM25 NLP Pipeline Test");
console.log("========================================");
console.log(`Dashboard loaded: ${dashboardSnapshot ? "Yes" : "No"}`);
console.log(`Dashboard fresh: ${dashboardDataFresh}`);
console.log("Type 'help' for commands, 'exit' to quit\n");

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

rl.setPrompt("You> ");
rl.prompt();

// Handle each line
rl.on("line", (line: string) => {
  const msg = line.trim();

  if (!msg) {
    rl.prompt();
    return;
  }

  // Handle commands
  if (msg.toLowerCase() === "exit" || msg.toLowerCase() === "quit") {
    console.log("Goodbye!");
    rl.close();
    process.exit(0);
  }

  if (msg.toLowerCase() === "refresh") {
    dashboardDataFresh = true;
    console.log("✅ Marked dashboardDataFresh=true\n");
    rl.prompt();
    return;
  }

  if (msg.toLowerCase() === "debug") {
    debugMode = !debugMode;
    console.log(`Debug mode: ${debugMode ? "ON" : "OFF"}\n`);
    rl.prompt();
    return;
  }

  if (msg.toLowerCase() === "help") {
    console.log("\n=== Commands ===");
    console.log("  refresh  - Mark dashboard data as fresh");
    console.log("  debug    - Toggle detailed pipeline output");
    console.log("  inspect  - Show snapshot structure");
    console.log("  intents  - List available intents");
    console.log("  catalog  - Show function catalog");
    console.log("  help     - Show this help");
    console.log("  exit     - Quit");
    console.log("\n=== Example Queries ===");
    console.log("  show me the dashboard");
    console.log("  which locomotives are out of service?");
    console.log("  what is the status of locomotive 8304?");
    console.log("  when is the next inspection due for 4430?");
    console.log("  who inspected locomotive 903?\n");
    rl.prompt();
    return;
  }

  if (msg.toLowerCase() === "intents") {
    console.log("\n=== Available Intents ===");
    for (const intent of INTENT_CATALOG) {
      console.log(`  ${intent.id}`);
      console.log(`    → ${intent.functionName}${intent.requiresLocoId ? " (requires locoId)" : ""}`);
      console.log(`    Examples: "${intent.canonicalExamples[0]}"`);
    }
    console.log("");
    rl.prompt();
    return;
  }

  if (msg.toLowerCase() === "catalog") {
    console.log("\n=== Function Catalog ===");
    console.log(`Version: ${functionCatalog.version}`);
    console.log(`Functions: ${functionCatalog.functions.length}`);
    for (const fn of functionCatalog.functions) {
      console.log(`  ${fn.name}`);
      console.log(`    recommendable: ${fn.recommendable}, readOnly: ${fn.readOnly}`);
      if (fn.argsSchema?.required) {
        console.log(`    required args: ${fn.argsSchema.required.join(", ")}`);
      }
      if (fn.returns?.readTheseFields) {
        console.log(`    returns: ${fn.returns.readTheseFields.slice(0, 3).join(", ")}...`);
      }
    }
    console.log("");
    rl.prompt();
    return;
  }

  if (msg.toLowerCase() === "inspect") {
    if (!dashboardSnapshot) {
      console.log("No snapshot loaded.\n");
      rl.prompt();
      return;
    }
    const snap = dashboardSnapshot as Record<string, unknown>;
    console.log("\n=== Snapshot Structure ===");
    console.log("Top-level keys:", Object.keys(snap).slice(0, 10));
    if (snap.data && typeof snap.data === "object") {
      const data = snap.data as Record<string, unknown>;
      if (data.locomotives && typeof data.locomotives === "object") {
        const locos = data.locomotives as Record<string, unknown>;
        const locoKeys = Object.keys(locos);
        console.log(`data.locomotives: ${locoKeys.length} entries`);
        if (locoKeys.length > 0) {
          const firstKey = locoKeys[0];
          const firstLoco = locos[firstKey] as Record<string, unknown>;
          console.log(`Sample loco (${firstKey}):`);
          console.log(`  locoNo: ${firstLoco.locoNo}`);
          console.log(`  name: ${firstLoco.name}`);
          console.log(`  keys: ${Object.keys(firstLoco).slice(0, 8).join(", ")}...`);
        }
      }
    }
    console.log("========================\n");
    rl.prompt();
    return;
  }

  // Process the query through the pipeline
  try {
    const { response, debug } = recommend(msg, {
      dashboardSnapshot,
      dashboardDataFresh,
      debugMode,
    });

    console.log("\n--- Bot Response ---");
    console.log(`Status: ${response.status}`);
    console.log(`Reply: ${response.replyText}`);
    
    if (response.recommendedCalls.length > 0) {
      console.log("\nRecommended Calls:");
      for (const call of response.recommendedCalls) {
        console.log(`  → ${call.functionName}(${JSON.stringify(call.args)})`);
      }
    }

    if (response.followUpQuestion) {
      console.log(`\nFollow-up: ${response.followUpQuestion}`);
    }

    if (response.readTheseFields?.length) {
      console.log(`\nFields to read: ${response.readTheseFields.slice(0, 5).join(", ")}${response.readTheseFields.length > 5 ? "..." : ""}`);
    }

    if (response.notes?.length) {
      console.log(`\nNotes: ${response.notes.join("; ")}`);
    }

    // Show debug info if enabled
    if (debug) {
      console.log("\n=== Debug: Pipeline Trace ===");
      console.log("\n[Step 1] Loco Query Extraction:");
      console.log(`  assetIds: ${debug.step1_locoQuery.assetIds.join(", ") || "(none)"}`);
      console.log(`  locoNumbers: ${debug.step1_locoQuery.locoNumbers.join(", ") || "(none)"}`);
      console.log(`  cleanedQuery: "${debug.step1_locoQuery.cleanedQuery}"`);

      console.log("\n[Step 2] BM25 Intent Matching:");
      for (const result of debug.step2_bm25Results.slice(0, 3)) {
        console.log(`  ${result.id}: ${result.score.toFixed(3)}`);
      }

      console.log("\n[Step 3] Matched Intent:");
      if (debug.step3_matchedIntent) {
        console.log(`  ${debug.step3_matchedIntent.id} → ${debug.step3_matchedIntent.functionName}`);
        console.log(`  BM25 score: ${debug.step3_bm25Score.toFixed(3)}`);
      } else {
        console.log("  (none matched threshold)");
      }

      console.log("\n[Step 4] CatalogGuard:");
      console.log(`  valid: ${debug.step5_catalogGuardResult.valid}`);
      if (debug.step5_catalogGuardResult.errors.length > 0) {
        console.log(`  errors: ${JSON.stringify(debug.step5_catalogGuardResult.errors)}`);
      }

      console.log("\n[Step 5] FieldGuard:");
      console.log(`  valid: ${debug.step6_fieldGuardResult.valid}`);
      if (debug.step6_fieldGuardResult.errors.length > 0) {
        console.log(`  errors: ${JSON.stringify(debug.step6_fieldGuardResult.errors)}`);
      }

      console.log("=============================");
    }

    console.log("");
  } catch (err) {
    console.error("Error:", (err as Error).message);
    console.error("Stack:", (err as Error).stack);
    console.log("");
  }

  rl.prompt();
});

rl.on("close", () => {
  console.log("\nGoodbye!");
  process.exit(0);
});