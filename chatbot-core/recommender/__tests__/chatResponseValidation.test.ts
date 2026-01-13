/**
 * Tests for ChatResponse contract validation
 * Ensures all responses from recommend() are schema-valid
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { validateChatResponse, validateStatusRules } from "../../contracts";

type RecommenderModule = typeof import("../ruleBasedRecommender");

function loadRecommenderModule(): RecommenderModule {
  const tsPath = path.resolve(__dirname, "../ruleBasedRecommender.ts");

  if (fs.existsSync(tsPath)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(tsPath) as RecommenderModule;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("../ruleBasedRecommender") as RecommenderModule;
}

const { createRuleBasedRecommender } = loadRecommenderModule();

// Minimal function catalog for testing
const testFunctionCatalog = {
  version: "1.0",
  functions: [
    {
      name: "getDashBoardData",
      recommendable: true,
      readOnly: true,
      tags: ["dashboard", "overview"],
      argsSchema: { type: "object" as const, required: [] },
    },
  ],
};

describe("ChatResponse Contract Validation", () => {
  const bot = createRuleBasedRecommender({ functionCatalog: testFunctionCatalog });

  describe("validateStatusRules", () => {
    it("allows answer status with recommendedCalls", () => {
      const response = {
        version: "1.0",
        status: "answer" as const,
        executionPolicy: "suggest_only" as const,
        replyText: "Here you go",
        recommendedCalls: [{ functionName: "getDashBoardData", args: {} }],
      };
      expect(validateStatusRules(response).valid).toBe(true);
    });

    it("rejects needs_followup with recommendedCalls", () => {
      const response = {
        version: "1.0",
        status: "needs_followup" as const,
        executionPolicy: "suggest_only" as const,
        replyText: "I need more info",
        followUpQuestion: "Which loco?",
        recommendedCalls: [{ functionName: "getDashBoardData", args: {} }],
      };
      const result = validateStatusRules(response);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("needs_followup");
    });

    it("rejects out_of_scope with recommendedCalls", () => {
      const response = {
        version: "1.0",
        status: "out_of_scope" as const,
        executionPolicy: "suggest_only" as const,
        replyText: "Can't help with that",
        outOfScopeReason: "Blocked",
        recommendedCalls: [{ functionName: "getDashBoardData", args: {} }],
      };
      const result = validateStatusRules(response);
      expect(result.valid).toBe(false);
    });

    it("rejects error with recommendedCalls", () => {
      const response = {
        version: "1.0",
        status: "error" as const,
        executionPolicy: "suggest_only" as const,
        replyText: "Something went wrong",
        recommendedCalls: [{ functionName: "getDashBoardData", args: {} }],
      };
      const result = validateStatusRules(response);
      expect(result.valid).toBe(false);
    });

    it("requires followUpQuestion for needs_followup", () => {
      const response = {
        version: "1.0",
        status: "needs_followup" as const,
        executionPolicy: "suggest_only" as const,
        replyText: "I need more info",
        recommendedCalls: [],
      };
      const result = validateStatusRules(response);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("followUpQuestion");
    });

    it("requires outOfScopeReason for out_of_scope", () => {
      const response = {
        version: "1.0",
        status: "out_of_scope" as const,
        executionPolicy: "suggest_only" as const,
        replyText: "Can't help",
        recommendedCalls: [],
      };
      const result = validateStatusRules(response);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("outOfScopeReason");
    });
  });

  describe("validateChatResponse", () => {
    it("validates a complete valid response", () => {
      const response = {
        version: "1.0",
        status: "answer",
        executionPolicy: "suggest_only",
        replyText: "Here is the data",
        recommendedCalls: [{ functionName: "getDashBoardData", args: {} }],
        readTheseFields: ["value.assetData"],
        notes: ["Debug info"],
      };
      const result = validateChatResponse(response);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects missing required fields", () => {
      const response = { status: "answer" };
      const result = validateChatResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("rejects invalid status", () => {
      const response = {
        version: "1.0",
        status: "invalid_status",
        executionPolicy: "suggest_only",
        replyText: "Test",
        recommendedCalls: [],
      };
      const result = validateChatResponse(response);
      expect(result.valid).toBe(false);
    });
  });

  describe("recommend() output validation", () => {
    const testCases = [
      { input: "", description: "empty input" },
      { input: "show me the dashboard", description: "dashboard query" },
      { input: "what about loco 8304", description: "loco query" },
      { input: "update the credit", description: "write request (blocked)" },
      { input: "show me the email", description: "sensitive request (blocked)" },
      { input: "asdfghjkl random text", description: "unclear intent" },
    ];

    testCases.forEach(({ input, description }) => {
      it(`produces valid response for: ${description}`, () => {
        const response = bot.recommend(input, {
          dashboardSnapshot: null,
          dashboardDataFresh: false,
          allowMaintenanceIntents: false,
        });

        const validation = validateChatResponse(response);
        expect(validation.valid).toBe(true);
        if (!validation.valid) {
          console.log(`Errors for "${input}":`, validation.errors);
        }
      });
    });
  });
});
