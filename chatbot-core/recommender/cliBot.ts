#!/usr/bin/env node
// cliBot.ts
import * as readline from "readline";
import { createRuleBasedRecommender, type FunctionCatalogJson } from "./ruleBasedRecommender";

// eslint-disable-next-line @typescript-eslint/no-var-requires
let functionCatalog: FunctionCatalogJson;
try {
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
      },
    ],
  };
}

// Try to import dashboard snapshot
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

const bot = createRuleBasedRecommender({ functionCatalog });

let dashboardDataFresh = !!dashboardSnapshot;
let debugMode = false;

// Print startup info
console.log("\n========================================");
console.log("  Dashboard Advisor Bot (CLI)");
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

// Set the prompt
rl.setPrompt("> ");
rl.prompt();

// Handle each line
rl.on("line", (line: string) => {
  const msg = line.trim();

  if (!msg) {
    rl.prompt();
    return;
  }

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
    console.log("\nCommands:");
    console.log("  refresh  - Mark dashboard data as fresh");
    console.log("  debug    - Toggle JSON output");
    console.log("  inspect  - Show snapshot structure");
    console.log("  help     - Show this help");
    console.log("  exit     - Quit");
    console.log("\nExample queries:");
    console.log("  show me the dashboard");
    console.log("  when did locomotive 8304 go out of use?");
    console.log("  which locomotives are out of service?\n");
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
          const firstLoco = locos[locoKeys[0]] as Record<string, unknown>;
          console.log(`Sample loco keys: ${Object.keys(firstLoco).slice(0, 10).join(", ")}`);
          console.log(`  locoNo: ${firstLoco.locoNo}`);
          console.log(`  name: ${firstLoco.name}`);
        }
      }
    }
    console.log("========================\n");
    rl.prompt();
    return;
  }

  // Process the query
  try {
    const res = bot.recommend(msg, {
      dashboardSnapshot,
      dashboardDataFresh,
      allowMaintenanceIntents: false,
    });

    console.log("");
    if (debugMode) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`Status: ${res.status}`);
      console.log(`Reply: ${res.replyText}`);
      if (res.recommendedCalls.length > 0) {
        console.log(`Calls: ${res.recommendedCalls.map((c) => c.functionName).join(", ")}`);
      }
      if (res.followUpQuestion) {
        console.log(`Follow-up: ${res.followUpQuestion}`);
      }
      if (res.readTheseFields?.length) {
        console.log(`Fields: ${res.readTheseFields.join(", ")}`);
      }
    }
    console.log("");
  } catch (err) {
    console.error("Error:", (err as Error).message, "\n");
  }

  rl.prompt();
});

rl.on("close", () => {
  console.log("\nGoodbye!");
  process.exit(0);
});
