#!/usr/bin/env node
/**
 * cliBot.ts - Interactive CLI for testing the Hybrid Recommender (lexical + semantic)
 */

import * as readline from "readline";
import * as path from "path";
import * as fs from "fs";
import type { ChatResponse } from "../contracts";

import type {
  RuleBasedRecommenderConfig,
  RecommenderContext,
  FunctionCatalogJson,
} from "./ruleBasedRecommender";

import { CatalogGuard } from "../guards/catalogGuard";
import { FieldGuard } from "../guards/fieldGurad";
import { getLiteDashboardAdapter } from "../adapters/liteDashboardAdapter";
import { createHybridRecommender } from "./hybridRecommender";

type RuleBasedRecommenderCtor = typeof import("./ruleBasedRecommender").RuleBasedRecommender;

function loadRuleBasedRecommender(): RuleBasedRecommenderCtor {
  const tsPath = path.resolve(__dirname, "ruleBasedRecommender.ts");

  if (fs.existsSync(tsPath)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(tsPath).RuleBasedRecommender as RuleBasedRecommenderCtor;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("./ruleBasedRecommender").RuleBasedRecommender as RuleBasedRecommenderCtor;
}

const RuleBasedRecommender = loadRuleBasedRecommender();

// ============================================================================
// LOAD FUNCTION CATALOG
// ============================================================================

let functionCatalog: FunctionCatalogJson;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  functionCatalog = require("./../../docs/FUNCTION_CATALOG.json") as FunctionCatalogJson;
  console.log("✅ Loaded FUNCTION_CATALOG.json");
  console.log(`   Version: ${functionCatalog.version}`);
  console.log(`   Functions: ${functionCatalog.functions.length}`);
} catch (err) {
  console.error("❌ Failed to load FUNCTION_CATALOG.json:", (err as Error).message);
  console.log("Creating minimal catalog...");
  functionCatalog = {
    version: "1.0",
    functions: [
      { name: "getDashBoardData", recommendable: true, readOnly: true, tags: ["dashboard", "overview"] },
      { name: "getAllLocomotivesCount", recommendable: true, readOnly: true, tags: ["count", "fleet"] },
      { name: "getAllOutOfServiceLocomotivesCount", recommendable: true, readOnly: true, tags: ["count", "oos"] },
      { name: "getAllNonCompliantLocomotives", recommendable: true, readOnly: true, tags: ["count", "compliance"] },
      { name: "getAllInspectionsCompletedTodayCount", recommendable: true, readOnly: true, tags: ["count", "inspections"] },
      { name: "getAllDailyInspectionLocomotivesCount", recommendable: true, readOnly: true, tags: ["count", "daily"] },
      { name: "getAllLocomotiveLastInspectionDate", recommendable: true, readOnly: true, tags: ["inspection", "last"] },
      { name: "getAllLocomotiveDueInspectionDate", recommendable: true, readOnly: true, tags: ["inspection", "due"] },
      { name: "getAllTestCodes", recommendable: true, readOnly: true, tags: ["test", "codes"] },
      { name: "getAllLocomotives", recommendable: true, readOnly: true, tags: ["list", "assets"] },
      {
        name: "getLocoNextDueLocoInspection",
        recommendable: true,
        readOnly: true,
        tags: ["inspection", "due"],
        argsSchema: { type: "object", required: ["assetId"], properties: { assetId: { type: "string" } } },
      },
      {
        name: "getLocoOutOfUseCredit",
        recommendable: true,
        readOnly: true,
        tags: ["credit", "oou"],
        argsSchema: { type: "object", required: ["assetId"], properties: { assetId: { type: "string" } } },
      },
    ],
  };
}

// ============================================================================
// DASHBOARD SNAPSHOT MANAGEMENT
// ============================================================================

let dashboardSnapshot: unknown = null;

function countLocomotives(data: unknown): number {
  if (!data || typeof data !== "object") return 0;
  const snap = data as Record<string, unknown>;

  if (snap.data && typeof snap.data === "object") {
    const d = snap.data as Record<string, unknown>;
    if (d.locomotives && typeof d.locomotives === "object") {
      return Object.keys(d.locomotives as object).length;
    }
  }

  if (snap.value && typeof snap.value === "object") {
    const v = snap.value as Record<string, unknown>;
    if (v.assetData && typeof v.assetData === "object") {
      return Object.keys(v.assetData as object).length;
    }
  }

  if (snap.assetData && typeof snap.assetData === "object") {
    return Object.keys(snap.assetData as object).length;
  }

  if (snap.locomotives && typeof snap.locomotives === "object") {
    return Object.keys(snap.locomotives as object).length;
  }

  return 0;
}

function loadSnapshotFromFile(filePath: string): boolean {
  try {
    const resolvedPath = path.resolve(filePath);
    
    if (!fs.existsSync(resolvedPath)) {
      console.log(`❌ File not found: ${resolvedPath}`);
      return false;
    }

    if (resolvedPath.endsWith(".js")) {
      delete require.cache[require.resolve(resolvedPath)];
    }

    let data: unknown;
    
    if (resolvedPath.endsWith(".json")) {
      const content = fs.readFileSync(resolvedPath, "utf-8");
      data = JSON.parse(content);
    } else if (resolvedPath.endsWith(".js")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const raw = require(resolvedPath);
      data = raw.default ?? raw;
    } else {
      try {
        const content = fs.readFileSync(resolvedPath, "utf-8");
        data = JSON.parse(content);
      } catch {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const raw = require(resolvedPath);
        data = raw.default ?? raw;
      }
    }

    if (!data || typeof data !== "object") {
      console.log(`❌ Invalid data format in: ${resolvedPath}`);
      return false;
    }

    dashboardSnapshot = data;
    console.log(`✅ Loaded dashboard snapshot from: ${resolvedPath}`);
    
    const locoCount = countLocomotives(data);
    if (locoCount > 0) {
      console.log(`   Found ${locoCount} locomotives`);
    } else {
      console.log(`   ⚠️ No locomotives found - check data structure`);
    }

    return true;
  } catch (err) {
    console.log(`❌ Failed to load: ${(err as Error).message}`);
    return false;
  }
}

function tryLoadDefaultSnapshot(): void {
  const possiblePaths = [
    path.resolve(__dirname, "../../../dashBoardDataJSON.js"),
    path.resolve(__dirname, "../../../dashBoardDataJSON.json"),
    path.resolve(__dirname, "../../dashBoardDataJSON.js"),
    path.resolve(__dirname, "../../dashBoardDataJSON.json"),
    path.resolve(process.cwd(), "dashBoardDataJSON.js"),
    path.resolve(process.cwd(), "dashBoardDataJSON.json"),
    path.resolve(process.cwd(), "data/dashBoardDataJSON.json"),
    path.resolve(process.cwd(), "data/dashboard.json"),
  ];

  for (const filePath of possiblePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const success = loadSnapshotFromFile(filePath);
        if (success && dashboardSnapshot) {
          return;
        }
      }
    } catch {
      // Try next path
    }
  }

  console.log("⚠️  No dashboard snapshot found at default locations.");
  console.log("   Use 'load <path>' command to load dashboard data.");
}

tryLoadDefaultSnapshot();

// ============================================================================
// INITIALIZE ADAPTER AND RECOMMENDER
// ============================================================================

const adapter = getLiteDashboardAdapter();
console.log(`✅ Loaded ${adapter.getServiceName()} adapter`);
console.log(`   Intents: ${adapter.getIntents().length}`);

const recommenderConfig: RuleBasedRecommenderConfig = {
  adapter,
  functionCatalog,
  responseVersion: "1.0",
};
const RESPONSE_VERSION = recommenderConfig.responseVersion ?? "1.0";

const recommender = new RuleBasedRecommender(recommenderConfig);
console.log("✅ Initialized RuleBasedRecommender (adapter-aware)");

// ============================================================================
// INITIALIZE GUARDS
// ============================================================================

const catalogGuard = new CatalogGuard({
  catalog: functionCatalog,
  safeMode: true,
  responseVersion: "1.0",
});

// Use the full function catalog for FieldGuard (not a simplified version)
// Strict allowlist: only fields declared in FUNCTION_CATALOG.json
const fieldGuard = new FieldGuard({
  catalog: functionCatalog,
  safeMode: true,
  allowInspectorId: false,
  responseVersion: "1.0",
});

console.log("✅ Initialized CatalogGuard and FieldGuard (safeMode=true)");

const hybrid = createHybridRecommender({
  recommender,
  adapter,
  functionCatalog,
  responseVersion: RESPONSE_VERSION,
  retrieval: {
    topK: 5,
    minScore: 0.35,
  },
  thresholds: {
    semMinScoreStrong: 0.5,
    semMinGap: 0.05,
  },
  maxContextPacks: 3,
  allowSoloLexicalWhenSemanticSkipped: true,
});
console.log("✅ Initialized HybridRecommender (lexical + semantic)");

// ============================================================================
// CLI STATE
// ============================================================================

let debugMode = false;
let showGuardDetails = false;

// ============================================================================
// PROCESS QUERY FUNCTION
// ============================================================================

async function processQuery(query: string): Promise<void> {
  const ctx: RecommenderContext = {
    dashboardSnapshot,
    dashboardDataFresh: !!dashboardSnapshot,
    allowMaintenanceIntents: false,
  };

  console.log("\n" + "─".repeat(60));
  const result = await hybrid.recommend(query, ctx);
  const rawResponse = result.response;

  if (debugMode) {
    console.log("\n[Debug] Raw Recommender Response:");
    console.log(`  Status: ${rawResponse.status}`);
    console.log(`  ReplyText: ${rawResponse.replyText}`);
    if (rawResponse.recommendedCalls.length > 0) {
      console.log(`  Calls: ${rawResponse.recommendedCalls.map(c => c.functionName).join(", ")}`);
    }
    if (rawResponse.notes?.length) {
      console.log(`  Notes: ${rawResponse.notes.join("; ")}`);
    }
  }

  if (debugMode && result.diagnostics) {
    const diagnostics = result.diagnostics;
    console.log("\n[Debug] Hybrid Routing:");
    console.log(
      `  Lexical: top=${diagnostics.lexTopIntentId ?? "none"} score=${diagnostics.lexTopScore?.toFixed(2) ?? "0"}`,
    );
    console.log(
      `  Semantic: topFn=${diagnostics.semTopFunctionName ?? "none"} score=${diagnostics.semMax?.toFixed(2) ?? "0"} gap=${diagnostics.semGap?.toFixed(2) ?? "0"}`,
    );
    console.log(
      `  Agreement: ${diagnostics.agreement ? "yes" : "no"} semDecent=${diagnostics.semDecent ? "yes" : "no"} lexDecent=${diagnostics.lexDecent ? "yes" : "no"}`,
    );
    if (diagnostics.semanticSkipped) {
      console.log("  Semantic: skipped (id-like query)");
    }
    if (diagnostics.semanticError) {
      console.log(`  SemanticError: ${diagnostics.semanticError}`);
    }
  }

  finalizeResponse(rawResponse);
}

function finalizeResponse(rawResponse: ChatResponse): void {
  const catalogResult = catalogGuard.guard(rawResponse);
  let guardedResponse = catalogResult.response;

  if (showGuardDetails || (debugMode && !catalogResult.valid)) {
    console.log("\n[CatalogGuard]");
    console.log(`  Valid: ${catalogResult.valid}`);
    if (catalogResult.errors.length > 0) {
      for (const err of catalogResult.errors) {
        console.log(`  Error: ${err.errorType} - ${err.message}`);
      }
    }
  }

  if (catalogResult.valid) {
    const fieldResult = fieldGuard.guard(guardedResponse);
    guardedResponse = fieldResult.response;

    if (showGuardDetails || (debugMode && !fieldResult.valid)) {
      console.log("\n[FieldGuard]");
      console.log(`  Valid: ${fieldResult.valid}`);
      if (fieldResult.errors.length > 0) {
        for (const err of fieldResult.errors) {
          console.log(`  Error: ${err.errorType} - ${err.message}`);
        }
      }
    }
  }

  displayResponse(guardedResponse);
}

// ============================================================================
// DISPLAY RESPONSE
// ============================================================================

function displayResponse(response: ChatResponse): void {
  console.log("\n📤 Bot Response");
  console.log("─".repeat(40));
  
  const statusEmoji: Record<string, string> = {
    answer: "✅",
    needs_followup: "❓",
    out_of_scope: "🚫",
    error: "❌",
  };
  console.log(`Status: ${statusEmoji[response.status] || "•"} ${response.status}`);
  console.log(`\nReply: ${response.replyText}`);

  // Show locoNo → assetId mapping prominently (first note that contains "→" or "assetId:")
  if (response.notes?.length) {
    const mappingNote = response.notes.find(n => n.includes("→") || n.includes("Using assetId:"));
    if (mappingNote) {
      console.log(`\n🔗 ${mappingNote}`);
    }
  }

  if (response.recommendedCalls.length > 0) {
    console.log("\n📞 Recommended Calls:");
    for (const call of response.recommendedCalls) {
      const argsStr = Object.keys(call.args).length > 0 ? JSON.stringify(call.args) : "{}";
      console.log(`   → ${call.functionName}(${argsStr})`);
    }
  }

  if (response.followUpQuestion) {
    console.log(`\n❓ Follow-up: ${response.followUpQuestion}`);
  }

  if (response.outOfScopeReason) {
    console.log(`\n🚫 Reason: ${response.outOfScopeReason}`);
  }

  if (response.readTheseFields?.length) {
    console.log(`\n📋 Fields to read:`);
    for (const field of response.readTheseFields) {
      console.log(`   • ${field}`);
    }
  }

  if (response.notes?.length && debugMode) {
    console.log("\n📝 Notes:");
    for (const note of response.notes) {
      // Skip the mapping note since we already showed it
      if (note.includes("→") || note.includes("Using assetId:")) continue;
      console.log(`   • ${note}`);
    }
  }

  console.log("");
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

function showHelp(): void {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║              Dashboard Advisor Bot - CLI                  ║
║        Hybrid Recommender Testing Interface               ║
╚════════════════════════════════════════════════════════════╝

Commands:
  help           - Show this help message
  load <path>    - Load dashboard data from a file (JSON or JS)
  debug          - Toggle debug mode (shows internal pipeline details)
  guards         - Toggle guard detail output
  intents        - List available adapter intents
  mappings       - Show adapter → service function mappings
  catalog        - Show function catalog
  inspect        - Show dashboard snapshot structure
  clear          - Clear the screen
  exit/quit      - Exit the CLI

Loading Data:
  load ./dashBoardDataJSON.json
  load /absolute/path/to/data.js
  load ../data/dashboard.json

Example Queries:
  • "show me the dashboard"
  • "how many locomotives are there?"
  • "which locomotives are out of service?"
  • "when is the next inspection due for 4430?"
  • "what is the out of use credit for 8304?"

Tips:
  • Load dashboard data to enable locoNo → assetId resolution
  • Debug mode shows the full pipeline trace
  • The bot recommends calls but never executes them
`);
}

function showIntents(): void {
  console.log("\n=== Adapter Intents ===");
  console.log(`Service: ${adapter.getServiceName()}`);
  console.log(`Total: ${adapter.getIntents().length}\n`);

  for (const intent of adapter.getIntents()) {
    console.log(`  ${intent.id}`);
    console.log(`    Method: ${intent.adapterMethod}`);
    console.log(`    Requires Loco: ${intent.requiresLocoRef}`);
    console.log(`    Example: "${intent.canonicalExamples[0]}"`);
  }
  console.log("");
}

function showMappings(): void {
  console.log("\n=== Adapter → Service Mappings ===");
  console.log(`Service: ${adapter.getServiceName()}\n`);

  const seenMethods = new Set<string>();
  for (const intent of adapter.getIntents()) {
    if (seenMethods.has(intent.adapterMethod)) continue;
    seenMethods.add(intent.adapterMethod);

    const mapping = adapter.getMapping(intent.adapterMethod);
    if (mapping) {
      console.log(`  ${intent.adapterMethod}`);
      console.log(`    → ${mapping.serviceMapping.functionName}()`);
      if (Object.keys(mapping.serviceMapping.argsTemplate).length > 0) {
        console.log(`    Args: ${JSON.stringify(mapping.serviceMapping.argsTemplate)}`);
      }
    }
  }
  console.log("");
}

function showCatalog(): void {
  console.log("\n=== Function Catalog ===");
  console.log(`Version: ${functionCatalog.version}`);
  console.log(`Functions: ${functionCatalog.functions.length}\n`);

  for (const fn of functionCatalog.functions) {
    const flags = [];
    if (fn.recommendable) flags.push("recommendable");
    if (fn.readOnly) flags.push("readOnly");
    console.log(`  ${fn.name}`);
    console.log(`    [${flags.join(", ")}]`);
    if (fn.argsSchema?.required?.length) {
      console.log(`    Required args: ${fn.argsSchema.required.join(", ")}`);
    }
  }
  console.log("");
}

function showSnapshot(): void {
  if (!dashboardSnapshot) {
    console.log("\n⚠️  No dashboard snapshot loaded.");
    console.log("   Use 'load <path>' to load a dashboard data file.\n");
    return;
  }

  console.log("\n=== Dashboard Snapshot Structure ===");
  const snap = dashboardSnapshot as Record<string, unknown>;
  console.log("Top-level keys:", Object.keys(snap).slice(0, 10));

  if (snap.data && typeof snap.data === "object") {
    const data = snap.data as Record<string, unknown>;
    if (data.locomotives && typeof data.locomotives === "object") {
      const locos = data.locomotives as Record<string, unknown>;
      const locoKeys = Object.keys(locos);
      console.log(`\ndata.locomotives: ${locoKeys.length} entries`);
      if (locoKeys.length > 0) {
        const firstKey = locoKeys[0];
        const firstLoco = locos[firstKey] as Record<string, unknown>;
        console.log(`Sample loco (${firstKey.slice(0, 8)}...):`);
        console.log(`  locoNo: ${firstLoco.locoNo ?? "(not found)"}`);
        console.log(`  name: ${firstLoco.name ?? "(not found)"}`);
      }
    }
  }

  if (snap.value && typeof snap.value === "object") {
    const value = snap.value as Record<string, unknown>;
    if (value.assetData && typeof value.assetData === "object") {
      const assetData = value.assetData as Record<string, unknown>;
      const assetKeys = Object.keys(assetData);
      console.log(`\nvalue.assetData: ${assetKeys.length} entries`);
      if (assetKeys.length > 0) {
        const firstKey = assetKeys[0];
        const firstAsset = assetData[firstKey] as Record<string, unknown>;
        console.log(`Sample asset (${firstKey.slice(0, 8)}...):`);
        console.log(`  locoNo: ${firstAsset.locoNo ?? "(not found)"}`);
        console.log(`  name: ${firstAsset.name ?? "(not found)"}`);
      }
    }
    if (value.summary && typeof value.summary === "object") {
      console.log("\nvalue.summary:", JSON.stringify(value.summary, null, 2).slice(0, 300) + "...");
    }
  }

  console.log("");
}

function loadSnapshot(filePath: string): void {
  if (!filePath) {
    console.log("\nUsage: load <path>");
    console.log("Example: load ./dashBoardDataJSON.json");
    console.log("         load /absolute/path/to/data.js\n");
    return;
  }

  loadSnapshotFromFile(filePath);
  console.log("");
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

console.log("\n" + "═".repeat(60));
console.log("  Dashboard Advisor Bot - CLI");
  console.log("  Hybrid Recommender (lexical + semantic)");
console.log(`  Service: ${adapter.getServiceName()}`);
console.log("═".repeat(60));
console.log(`Dashboard loaded: ${dashboardSnapshot ? "Yes ✅" : "No ⚠️ (use 'load <path>')"}`);
console.log("Type 'help' for commands, 'exit' to quit\n");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

rl.setPrompt("You> ");
rl.prompt();

rl.on("line", async (line: string) => {
  const msg = line.trim();

  if (!msg) {
    rl.prompt();
    return;
  }

  const parts = msg.split(/\s+/);
  const command = parts[0].toLowerCase();

  switch (command) {
    case "exit":
    case "quit":
      console.log("Goodbye! 👋");
      rl.close();
      process.exit(0);
      break;

    case "help":
      showHelp();
      break;

    case "load":
      loadSnapshot(parts.slice(1).join(" "));
      break;

    case "debug":
      debugMode = !debugMode;
      console.log(`\nDebug mode: ${debugMode ? "ON 🔍" : "OFF"}\n`);
      break;

    case "guards":
      showGuardDetails = !showGuardDetails;
      console.log(`\nGuard details: ${showGuardDetails ? "ON 🛡️" : "OFF"}\n`);
      break;

    case "intents":
      showIntents();
      break;

    case "mappings":
      showMappings();
      break;

    case "catalog":
      showCatalog();
      break;

    case "inspect":
      showSnapshot();
      break;

    case "clear":
      console.clear();
      console.log("Dashboard Advisor Bot - CLI\n");
      break;

    default:
      try {
        await processQuery(msg);
      } catch (err) {
        console.error("\n❌ Error processing query:", (err as Error).message);
        if (debugMode) {
          console.error((err as Error).stack);
        }
        console.log("");
      }
  }

  rl.prompt();
});

rl.on("close", () => {
  console.log("\nGoodbye! 👋");
  process.exit(0);
});
