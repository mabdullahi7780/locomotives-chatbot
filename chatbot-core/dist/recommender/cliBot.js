"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// cliBot.ts
const readline = __importStar(require("readline"));
const ruleBasedRecommender_1 = require("./ruleBasedRecommender");
// Import the function catalog JSON directly
// eslint-disable-next-line @typescript-eslint/no-var-requires
const functionCatalog = require("./../../docs/FUNCTION_CATALOG.json");
// Try to import dashboard snapshot - adjust path based on your actual file location
let dashboardSnapshot = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    dashboardSnapshot = require("./../../dashBoardDataJSON.js");
}
catch {
    console.log("Note: dashBoardDataJSON not found, running without snapshot");
}
const bot = (0, ruleBasedRecommender_1.createRuleBasedRecommender)({
    functionCatalog, // No need for "as any" since type matches
});
let dashboardDataFresh = false;
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
console.log("Dashboard Advisor Bot (type 'refresh' to simulate getDashBoardData)");
console.log("Type your question and press Enter. Type 'exit' to quit.\n");
rl.on("line", (line) => {
    const msg = line.trim();
    if (msg.toLowerCase() === "exit") {
        rl.close();
        process.exit(0);
    }
    if (msg.toLowerCase() === "refresh") {
        dashboardDataFresh = true;
        console.log("✅ Marked dashboardDataFresh=true (simulated refresh)\n");
        return;
    }
    const res = bot.recommend(msg, {
        dashboardSnapshot,
        dashboardDataFresh,
        allowMaintenanceIntents: false,
    });
    console.log(JSON.stringify(res, null, 2));
    console.log("");
});
