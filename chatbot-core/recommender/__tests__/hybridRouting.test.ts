/**
 * Hybrid recommender routing tests (lexical + semantic agreement).
 */

import { describe, it, expect } from "vitest";
import { createRuleBasedRecommender } from "../ruleBasedRecommender.ts";
import { createHybridRecommender } from "../hybridRecommender.ts";
import { getLiteDashboardAdapter } from "../../adapters/liteDashboardAdapter.ts";

const adapter = getLiteDashboardAdapter();

const testFunctionCatalog = {
  version: "1.0",
  functions: [
    {
      name: "getDashBoardData",
      recommendable: true,
      readOnly: true,
      tags: ["dashboard", "overview"],
      argsSchema: { type: "object" as const, required: [] },
      returns: { readTheseFields: ["value.summary", "value.assetData.<assetId>"] },
    },
    {
      name: "getAllLocomotivesCount",
      recommendable: true,
      readOnly: true,
      tags: ["count", "fleet"],
      argsSchema: { type: "object" as const, required: [] },
      returns: { readTheseFields: ["$"] },
    },
    {
      name: "getLocoNextDueLocoInspection",
      recommendable: true,
      readOnly: true,
      tags: ["inspection", "due"],
      argsSchema: { type: "object" as const, required: ["assetId"] },
      returns: { readTheseFields: ["nextExpiryDate"] },
    },
  ],
};

const recommender = createRuleBasedRecommender({
  adapter,
  functionCatalog: testFunctionCatalog,
  responseVersion: "1.0",
});

function hit(functionName: string, score: number) {
  return {
    score,
    doc: {
      id: `function:${functionName}`,
      source: "function_catalog" as const,
      text: functionName,
      functionName,
      snippet: `ContextPack: intent=unknown; adapterMethod=unknown; function=${functionName}; requiredArgs=none; readFields=none; description=stub`,
    },
  };
}

describe("Hybrid routing (agreement gating)", () => {
  it("answers when lexical + semantic agree", async () => {
    const hybrid = createHybridRecommender({
      recommender,
      adapter,
      functionCatalog: testFunctionCatalog,
      semanticRetriever: async (_text, _opts) => [hit("getDashBoardData", 0.6)],
    });

    const result = await hybrid.recommend("show me the dashboard", {
      dashboardSnapshot: null,
      dashboardDataFresh: false,
      allowMaintenanceIntents: false,
    });

    expect(result.response.status).toBe("answer");
    expect(result.response.recommendedCalls[0]?.functionName).toBe("getDashBoardData");
  });

  it("asks follow-up when semantic disagrees with lexical", async () => {
    const hybrid = createHybridRecommender({
      recommender,
      adapter,
      functionCatalog: testFunctionCatalog,
      semanticRetriever: async (_text, _opts) => [hit("getAllLocomotivesCount", 0.6)],
    });

    const result = await hybrid.recommend("show me the dashboard", {
      dashboardSnapshot: null,
      dashboardDataFresh: false,
      allowMaintenanceIntents: false,
    });

    expect(result.response.status).toBe("needs_followup");
    expect(result.response.recommendedCalls).toHaveLength(0);
  });

  it("treats weak semantic matches as not decent", async () => {
    const hybrid = createHybridRecommender({
      recommender,
      adapter,
      functionCatalog: testFunctionCatalog,
      semanticRetriever: async (_text, _opts) => [
        hit("getDashBoardData", 0.48),
        hit("getAllLocomotivesCount", 0.44),
      ],
      thresholds: { semMinScoreStrong: 0.5, semMinGap: 0.05 },
    });

    const result = await hybrid.recommend("show me the dashboard", {
      dashboardSnapshot: null,
      dashboardDataFresh: false,
      allowMaintenanceIntents: false,
    });

    expect(result.response.status).toBe("needs_followup");
  });

  it("returns out_of_scope when neither retriever is confident", async () => {
    const hybrid = createHybridRecommender({
      recommender,
      adapter,
      functionCatalog: testFunctionCatalog,
      semanticRetriever: async (_text, _opts) => [],
    });

    const result = await hybrid.recommend("asdfghjkl random text", {
      dashboardSnapshot: null,
      dashboardDataFresh: false,
      allowMaintenanceIntents: false,
    });

    expect(result.response.status).toBe("out_of_scope");
  });

  it("allows lexical-only answer when semantic is skipped for ID-like input", async () => {
    const hybrid = createHybridRecommender({
      recommender,
      adapter,
      functionCatalog: testFunctionCatalog,
      semanticRetriever: async (_text, _opts) => [],
      allowSoloLexicalWhenSemanticSkipped: true,
    });

    const result = await hybrid.recommend("4430", {
      dashboardSnapshot: null,
      dashboardDataFresh: false,
      allowMaintenanceIntents: false,
    });

    expect(result.response.status).toBe("answer");
  });
});
