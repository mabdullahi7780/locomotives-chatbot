// Simple test - no readline
import { createRuleBasedRecommender, type FunctionCatalogJson } from "./ruleBasedRecommender";

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
