// Simple test - no readline
import * as fs from "fs";
import * as path from "path";
import type { FunctionCatalogJson } from "./ruleBasedRecommender";

type RecommenderModule = typeof import("./ruleBasedRecommender");

function loadRecommenderModule(): RecommenderModule {
  const tsPath = path.resolve(__dirname, "ruleBasedRecommender.ts");

  if (fs.existsSync(tsPath)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(tsPath) as RecommenderModule;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("./ruleBasedRecommender") as RecommenderModule;
}

const { createRuleBasedRecommender } = loadRecommenderModule();

const functionCatalog: FunctionCatalogJson = {
  version: "1.0",
  functions: [
    { name: "getDashBoardData", recommendable: true, readOnly: true, tags: ["dashboard"] },
  ],
};

const bot = createRuleBasedRecommender({ functionCatalog });

// Test queries
const queries = [
  "show me the dashboard",
  "when did locomotive 8304 go out of use?",
  "which locomotives are out of service?",
];

console.log("Testing bot...\n");

for (const q of queries) {
  console.log(`Q: ${q}`);
  const res = bot.recommend(q, { dashboardSnapshot: null, dashboardDataFresh: false });
  console.log(`Status: ${res.status}`);
  console.log(`Reply: ${res.replyText}`);
  console.log("");
}

console.log("Done!");
