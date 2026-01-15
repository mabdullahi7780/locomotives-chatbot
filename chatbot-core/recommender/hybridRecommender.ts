import type { ChatResponse } from "../contracts";
import type {
  FunctionCatalogJson,
  LexicalRankResult,
  RecommenderContext,
  RuleBasedRecommender,
} from "./ruleBasedRecommender";
import type { AdapterIntentDefinition, IDashboardAdapter } from "../adapters/adapterTypes";
import { getLiteDashboardAdapter } from "../adapters/liteDashboardAdapter";
import { INTENT_CATALOG, type IntentSpec } from "../intents/intentCatalog";
import {
  queryEmbeddingIndex,
  type EmbeddingDocument,
  type QueryEmbeddingIndexOptions,
  type RetrievalHit,
} from "./retrieval/queryEmbeddingIndex";

type FunctionCatalogEntry = FunctionCatalogJson["functions"][number] & {
  description?: string;
  returns?: { readTheseFields?: string[] };
};

type SemanticFunctionCandidate = {
  functionName: string;
  score: number;
  intentId?: string;
  source: string;
  snippet?: string;
};

type HybridCandidate = {
  intentId: string;
  adapterMethod: string;
  functionName: string;
  lexScore: number;
  semScore: number;
  lexNorm: number;
  semNorm: number;
  finalScore: number;
};

type FusionConfig = {
  wLex: number;
  wSem: number;
  agreeBoost: number;
};

type ThresholdConfig = {
  lexMinScore: number;
  lexMinGap: number;
  lexMinScoreSolo: number;
  lexMinGapSolo: number;
  semMinScoreStrong: number;
  semMinGap: number;
  minFinalScore: number;
  minFinalGap: number;
};

export type HybridDecision = {
  response: ChatResponse;
  decision: "answer" | "needs_followup" | "out_of_scope";
  diagnostics?: {
    lexTopIntentId?: string | null;
    lexTopScore?: number;
    lexSecondScore?: number;
    semTopFunctionName?: string | null;
    semMax?: number;
    semGap?: number;
    semDecent?: boolean;
    lexDecent?: boolean;
    agreement?: boolean;
    semanticSkipped?: boolean;
    semanticError?: string | null;
  };
};

export type HybridRecommenderConfig = {
  recommender: RuleBasedRecommender;
  functionCatalog: FunctionCatalogJson;
  adapter?: IDashboardAdapter;
  responseVersion?: string;
  retrieval?: QueryEmbeddingIndexOptions;
  fusion?: Partial<FusionConfig>;
  thresholds?: Partial<ThresholdConfig>;
  allowSoloLexicalWhenSemanticSkipped?: boolean;
  maxContextPacks?: number;
  semanticRetriever?: (
    text: string,
    opts: QueryEmbeddingIndexOptions,
  ) => Promise<RetrievalHit[]>;
};

const DEFAULT_FUSION: FusionConfig = {
  wLex: 0.6,
  wSem: 0.4,
  agreeBoost: 0.2,
};

const DEFAULT_THRESHOLDS: ThresholdConfig = {
  lexMinScore: 1.8,
  lexMinGap: 0.6,
  lexMinScoreSolo: 2.2,
  lexMinGapSolo: 0.8,
  semMinScoreStrong: 0.5,
  semMinGap: 0.05,
  minFinalScore: 0.5,
  minFinalGap: 0.12,
};

const DEFAULT_RETRIEVAL: QueryEmbeddingIndexOptions = {
  topK: 5,
  minScore: 0.35,
};

export class HybridRecommender {
  private readonly recommender: RuleBasedRecommender;
  private readonly adapter: IDashboardAdapter;
  private readonly responseVersion: string;
  private readonly retrieval: QueryEmbeddingIndexOptions;
  private readonly fusion: FusionConfig;
  private readonly thresholds: ThresholdConfig;
  private readonly allowSoloLexicalWhenSemanticSkipped: boolean;
  private readonly maxContextPacks: number;
  private readonly semanticRetriever: (
    text: string,
    opts: QueryEmbeddingIndexOptions,
  ) => Promise<RetrievalHit[]>;

  private readonly adapterIntents: AdapterIntentDefinition[];
  private readonly adapterIntentById: Map<string, AdapterIntentDefinition>;
  private readonly adapterIntentFunctionName: Map<string, string>;
  private readonly functionNameToAdapterIntents: Map<string, AdapterIntentDefinition[]>;
  private readonly functionCatalogIndex: Map<string, FunctionCatalogEntry>;

  constructor(config: HybridRecommenderConfig) {
    this.recommender = config.recommender;
    this.adapter = config.adapter ?? getLiteDashboardAdapter();
    this.responseVersion = config.responseVersion ?? "1.0";
    this.retrieval = { ...DEFAULT_RETRIEVAL, ...(config.retrieval ?? {}) };
    this.fusion = { ...DEFAULT_FUSION, ...(config.fusion ?? {}) };
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...(config.thresholds ?? {}) };
    this.allowSoloLexicalWhenSemanticSkipped =
      config.allowSoloLexicalWhenSemanticSkipped ?? true;
    this.maxContextPacks = config.maxContextPacks ?? 3;
    this.semanticRetriever = config.semanticRetriever ?? queryEmbeddingIndex;

    this.adapterIntents = this.adapter.getIntents();
    this.adapterIntentById = new Map(
      this.adapterIntents.map((intent) => [intent.id, intent]),
    );
    this.adapterIntentFunctionName = buildAdapterIntentFunctionMap(
      this.adapter,
      this.adapterIntents,
    );
    this.functionNameToAdapterIntents = buildFunctionNameToIntentMap(
      this.adapterIntents,
      this.adapterIntentFunctionName,
    );
    this.functionCatalogIndex = buildFunctionCatalogIndex(config.functionCatalog);
  }

  async recommend(userText: string, ctx: RecommenderContext = {}): Promise<HybridDecision> {
    const precheck = this.recommender.precheck(userText, ctx);
    if (precheck) {
      const decision = precheck.status === "error" ? "out_of_scope" : precheck.status;
      return { response: precheck, decision };
    }

    const lexical = this.recommender.rankIntents(userText);
    const lexScoreByIntent = collapseLexicalScores(lexical);
    const { lexMax, overrideIntentId } = applyOverrideBoost(
      lexScoreByIntent,
      lexical.overrideIntentId,
      this.thresholds.lexMinScore,
    );
    const lexTopIntentId = overrideIntentId ?? lexical.ranked[0]?.intentId ?? null;
    const lexTopScore = lexScoreByIntent.get(lexTopIntentId ?? "") ?? 0;
    const lexSecondScore = lexical.ranked[overrideIntentId ? 0 : 1]?.score ?? 0;
    const lexDecent =
      Boolean(overrideIntentId) ||
      (lexTopScore >= this.thresholds.lexMinScore &&
        lexTopScore - lexSecondScore >= this.thresholds.lexMinGap);
    const lexDecentSolo =
      Boolean(overrideIntentId) ||
      (lexTopScore >= this.thresholds.lexMinScoreSolo &&
        lexTopScore - lexSecondScore >= this.thresholds.lexMinGapSolo);
    const lexTopFunctionName = lexTopIntentId
      ? this.adapterIntentFunctionName.get(lexTopIntentId) ?? null
      : null;

    const semanticSkipped = looksLikeMostlyId(userText);
    let semanticHits: RetrievalHit[] = [];
    let semanticError: string | null = null;

    if (!semanticSkipped) {
      try {
        semanticHits = await this.semanticRetriever(userText, this.retrieval);
      } catch (err) {
        semanticError = (err as Error).message;
      }
    }

    const semanticCandidates = buildSemanticFunctionCandidates(
      semanticHits,
      this.functionCatalogIndex,
    );
    const semanticScoreByFunction = collapseSemanticScores(semanticCandidates);
    const semSorted = sortSemanticCandidates(semanticCandidates);
    const semTopFunctionName = semSorted[0]?.functionName ?? null;
    const semMax = semSorted[0]?.score ?? 0;
    const semSecond = semSorted[1]?.score ?? 0;
    const semGap = semMax - semSecond;
    const semDecent =
      !semanticSkipped &&
      semMax >= this.thresholds.semMinScoreStrong &&
      semGap >= this.thresholds.semMinGap;

    const lexTopIntentIds = topIntentIds(lexical, overrideIntentId, 5);
    const semTopFunctions = topFunctionNames(semanticCandidates, 5);

    const fusedCandidates = buildFusedCandidates({
      adapterIntents: this.adapterIntents,
      adapterIntentFunctionName: this.adapterIntentFunctionName,
      lexScoreByIntent,
      lexMax,
      semScoreByFunction: semanticScoreByFunction,
      semMax,
      lexTopIntentIds,
      semTopFunctions,
      wLex: this.fusion.wLex,
      wSem: this.fusion.wSem,
      agreeBoost: this.fusion.agreeBoost,
      semDecent,
    });

    const top = fusedCandidates[0];
    const runnerUp = fusedCandidates[1];
    const finalGap = top ? top.finalScore - (runnerUp?.finalScore ?? 0) : 0;
    const finalStrong =
      !!top &&
      top.finalScore >= this.thresholds.minFinalScore &&
      finalGap >= this.thresholds.minFinalGap;

    const agreement =
      Boolean(lexTopFunctionName) &&
      Boolean(semTopFunctionName) &&
      lexTopFunctionName === semTopFunctionName;

    const contextNotes = buildContextNotes({
      hits: semanticHits,
      maxNotes: this.maxContextPacks,
      lexScoreByIntent,
      functionCatalogIndex: this.functionCatalogIndex,
      functionNameToAdapterIntents: this.functionNameToAdapterIntents,
    });

    let decision: HybridDecision["decision"] = "needs_followup";
    let response: ChatResponse;

    if (lexDecent && semDecent && agreement && finalStrong && lexTopIntentId) {
      decision = "answer";
      response = this.recommender.recommendForIntent(
        lexTopIntentId,
        userText,
        ctx,
        contextNotes,
      );
    } else if (
      semanticSkipped &&
      this.allowSoloLexicalWhenSemanticSkipped &&
      lexDecentSolo &&
      lexTopIntentId
    ) {
      decision = "answer";
      response = this.recommender.recommendForIntent(
        lexTopIntentId,
        userText,
        ctx,
        contextNotes,
      );
    } else if (!lexDecent && !semDecent) {
      decision = "out_of_scope";
      response = buildOutOfScopeResponse(
        this.responseVersion,
        "I'm not confident I can map that request to a supported dashboard intent.",
        contextNotes,
      );
    } else {
      decision = "needs_followup";
      response = buildNeedsFollowupResponse(
        this.responseVersion,
        buildFollowupQuestion(fusedCandidates.slice(0, 4), this.adapterIntentById),
        contextNotes,
      );
    }

    return {
      response,
      decision,
      diagnostics: {
        lexTopIntentId,
        lexTopScore,
        lexSecondScore,
        semTopFunctionName,
        semMax,
        semGap,
        semDecent,
        lexDecent,
        agreement,
        semanticSkipped,
        semanticError,
      },
    };
  }
}

export function createHybridRecommender(config: HybridRecommenderConfig): HybridRecommender {
  return new HybridRecommender(config);
}

function buildFunctionCatalogIndex(
  catalog: FunctionCatalogJson,
): Map<string, FunctionCatalogEntry> {
  const index = new Map<string, FunctionCatalogEntry>();
  for (const fn of catalog.functions ?? []) {
    index.set(fn.name, fn as FunctionCatalogEntry);
  }
  return index;
}

function buildAdapterIntentFunctionMap(
  adapterInstance: IDashboardAdapter,
  intents: AdapterIntentDefinition[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const intent of intents) {
    const mapping = adapterInstance.getMapping(intent.adapterMethod);
    if (mapping?.serviceMapping?.functionName) {
      map.set(intent.id, mapping.serviceMapping.functionName);
    }
  }
  return map;
}

function buildFunctionNameToIntentMap(
  intents: AdapterIntentDefinition[],
  intentFunctionName: Map<string, string>,
): Map<string, AdapterIntentDefinition[]> {
  const map = new Map<string, AdapterIntentDefinition[]>();
  for (const intent of intents) {
    const functionName = intentFunctionName.get(intent.id);
    if (!functionName) continue;
    const existing = map.get(functionName) ?? [];
    existing.push(intent);
    map.set(functionName, existing);
  }
  return map;
}

function buildSemanticFunctionCandidates(
  hits: RetrievalHit[],
  catalogIndex: Map<string, FunctionCatalogEntry>,
): SemanticFunctionCandidate[] {
  const candidates: SemanticFunctionCandidate[] = [];

  for (const hit of hits) {
    const fnNames = new Set<string>();
    const { doc } = hit;

    if (doc.functionName) {
      fnNames.add(doc.functionName);
    }

    if (doc.intentId) {
      const spec =
        (INTENT_CATALOG as Record<string, IntentSpec | undefined>)[doc.intentId];
      if (spec?.safety === "safe") {
        for (const call of spec.recommendedCalls ?? []) {
          if (call?.function) fnNames.add(call.function);
        }
      }
    }

    for (const functionName of fnNames) {
      const fnSpec = catalogIndex.get(functionName);
      if (!fnSpec || !fnSpec.recommendable || !fnSpec.readOnly) continue;
      candidates.push({
        functionName,
        score: hit.score,
        intentId: doc.intentId,
        source: doc.source,
        snippet: doc.snippet,
      });
    }
  }

  return candidates;
}

function sortSemanticCandidates(
  candidates: SemanticFunctionCandidate[],
): SemanticFunctionCandidate[] {
  const bestByFunction = new Map<string, SemanticFunctionCandidate>();
  for (const candidate of candidates) {
    const existing = bestByFunction.get(candidate.functionName);
    if (!existing || candidate.score > existing.score) {
      bestByFunction.set(candidate.functionName, candidate);
    }
  }

  return [...bestByFunction.values()].sort((a, b) => b.score - a.score);
}

function collapseSemanticScores(
  candidates: SemanticFunctionCandidate[],
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const candidate of candidates) {
    const prev = scores.get(candidate.functionName) ?? 0;
    if (candidate.score > prev) scores.set(candidate.functionName, candidate.score);
  }
  return scores;
}

function collapseLexicalScores(lexical: LexicalRankResult): Map<string, number> {
  const scores = new Map<string, number>();
  for (const item of lexical.ranked) {
    scores.set(item.intentId, item.score);
  }
  return scores;
}

function applyOverrideBoost(
  scores: Map<string, number>,
  overrideIntentId: string | null,
  minScore: number,
): { lexMax: number; overrideIntentId: string | null } {
  let lexMax = maxScore(scores);
  if (overrideIntentId) {
    const boosted = Math.max(lexMax, minScore) + 1;
    scores.set(overrideIntentId, boosted);
    lexMax = Math.max(lexMax, boosted);
  }
  return { lexMax, overrideIntentId };
}

function topIntentIds(
  lexical: LexicalRankResult,
  overrideIntentId: string | null,
  topK: number,
): Set<string> {
  const ids = new Set(lexical.ranked.slice(0, topK).map((r) => r.intentId));
  if (overrideIntentId) ids.add(overrideIntentId);
  return ids;
}

function topFunctionNames(candidates: SemanticFunctionCandidate[], topK: number): string[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const candidate of sorted) {
    if (seen.has(candidate.functionName)) continue;
    seen.add(candidate.functionName);
    out.push(candidate.functionName);
    if (out.length >= topK) break;
  }

  return out;
}

function maxScore(scores: Map<string, number>): number {
  let max = 0;
  for (const value of scores.values()) {
    if (value > max) max = value;
  }
  return max;
}

function buildFusedCandidates(input: {
  adapterIntents: AdapterIntentDefinition[];
  adapterIntentFunctionName: Map<string, string>;
  lexScoreByIntent: Map<string, number>;
  lexMax: number;
  semScoreByFunction: Map<string, number>;
  semMax: number;
  lexTopIntentIds: Set<string>;
  semTopFunctions: string[];
  wLex: number;
  wSem: number;
  agreeBoost: number;
  semDecent: boolean;
}): HybridCandidate[] {
  const {
    adapterIntents,
    adapterIntentFunctionName,
    lexScoreByIntent,
    lexMax,
    semScoreByFunction,
    semMax,
    lexTopIntentIds,
    semTopFunctions,
    wLex,
    wSem,
    agreeBoost,
    semDecent,
  } = input;

  const semTopSet = new Set(semTopFunctions);
  const candidates: HybridCandidate[] = [];

  for (const intent of adapterIntents) {
    const functionName = adapterIntentFunctionName.get(intent.id) ?? "unknown";
    const lexScore = lexScoreByIntent.get(intent.id) ?? 0;
    const semScore = functionName ? semScoreByFunction.get(functionName) ?? 0 : 0;
    const lexNorm = lexMax > 0 ? lexScore / lexMax : 0;
    const semNorm = semDecent && semMax > 0 ? semScore / semMax : 0;

    let finalScore = wLex * lexNorm + wSem * semNorm;
    if (lexTopIntentIds.has(intent.id) && semTopSet.has(functionName)) {
      finalScore += agreeBoost;
    }

    candidates.push({
      intentId: intent.id,
      adapterMethod: intent.adapterMethod,
      functionName,
      lexScore,
      semScore,
      lexNorm,
      semNorm,
      finalScore,
    });
  }

  candidates.sort((a, b) => b.finalScore - a.finalScore);
  return candidates;
}

function buildContextNotes(input: {
  hits: RetrievalHit[];
  maxNotes: number;
  lexScoreByIntent: Map<string, number>;
  functionCatalogIndex: Map<string, FunctionCatalogEntry>;
  functionNameToAdapterIntents: Map<string, AdapterIntentDefinition[]>;
}): string[] {
  const { hits, maxNotes, lexScoreByIntent, functionCatalogIndex, functionNameToAdapterIntents } =
    input;
  const notes: string[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const snippet = buildSnippetFromDoc(hit.doc, {
      lexScoreByIntent,
      functionCatalogIndex,
      functionNameToAdapterIntents,
    });
    if (!snippet || seen.has(snippet)) continue;
    seen.add(snippet);
    notes.push(snippet);
    if (notes.length >= maxNotes) break;
  }

  return notes;
}

function buildSnippetFromDoc(
  doc: EmbeddingDocument,
  context: {
    lexScoreByIntent: Map<string, number>;
    functionCatalogIndex: Map<string, FunctionCatalogEntry>;
    functionNameToAdapterIntents: Map<string, AdapterIntentDefinition[]>;
  },
): string | null {
  if (doc.snippet) return doc.snippet;

  if (doc.functionName) {
    const fnSpec = context.functionCatalogIndex.get(doc.functionName);
    if (!fnSpec) return null;
    const intents = context.functionNameToAdapterIntents.get(doc.functionName) ?? [];
    const picked = intents.length ? pickBestIntentForFunction(intents, context.lexScoreByIntent) : null;
    const requiredArgs = fnSpec.argsSchema?.required ?? [];
    const readFields = fnSpec.returns?.readTheseFields ?? [];
    const description = fnSpec.description ?? picked?.description ?? "No description available.";

    return buildContextPack({
      intentId: picked?.id ?? "unknown",
      adapterMethod: picked?.adapterMethod ?? "unknown",
      functionName: doc.functionName,
      requiredArgs,
      readFields,
      description,
    });
  }

  if (doc.intentId) {
    const spec =
      (INTENT_CATALOG as Record<string, IntentSpec | undefined>)[doc.intentId];
    if (!spec) return null;
    const functions = spec.recommendedCalls?.map((call) => call.function).filter(Boolean) ?? [];
    const functionName = functions[0] ?? null;
    const fnSpec = functionName ? context.functionCatalogIndex.get(functionName) : null;
    const requiredArgs = fnSpec?.argsSchema?.required ?? [];
    const readFields = spec.readTheseFields ?? fnSpec?.returns?.readTheseFields ?? [];
    const description = spec.description ?? fnSpec?.description ?? "No description available.";

    return buildContextPack({
      intentId: doc.intentId,
      adapterMethod: "unknown",
      functionName: functionName ?? "unknown",
      requiredArgs,
      readFields,
      description,
    });
  }

  return null;
}

function buildContextPack(input: {
  intentId: string;
  adapterMethod: string;
  functionName: string;
  requiredArgs: string[];
  readFields: string[];
  description: string;
}): string {
  return [
    "ContextPack:",
    `intent=${input.intentId}`,
    `adapterMethod=${input.adapterMethod}`,
    `function=${input.functionName}`,
    `requiredArgs=${formatList(input.requiredArgs, "none")}`,
    `readFields=${formatList(input.readFields, "none")}`,
    `description=${normalizeSnippet(input.description)}`,
  ].join("; ");
}

function pickBestIntentForFunction(
  intents: AdapterIntentDefinition[],
  lexScoreByIntent: Map<string, number>,
): AdapterIntentDefinition {
  let best = intents[0];
  let bestScore = lexScoreByIntent.get(best.id) ?? 0;

  for (let i = 1; i < intents.length; i += 1) {
    const candidate = intents[i];
    const score = lexScoreByIntent.get(candidate.id) ?? 0;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function buildFollowupQuestion(
  candidates: HybridCandidate[],
  adapterIntentById: Map<string, AdapterIntentDefinition>,
): string {
  const options = candidates
    .slice(0, 4)
    .map((candidate) => adapterIntentById.get(candidate.intentId)?.description ?? candidate.intentId)
    .filter(Boolean);

  if (options.length === 0) {
    return "Could you clarify what you want to know about the dashboard?";
  }
  if (options.length === 1) {
    return `Did you mean: ${options[0]}?`;
  }

  return `I'm not sure which dashboard intent you mean. Are you asking about: ${options.join("; ")}?`;
}

function buildNeedsFollowupResponse(
  responseVersion: string,
  question: string,
  notes?: string[],
): ChatResponse {
  return {
    version: responseVersion,
    status: "needs_followup",
    executionPolicy: "suggest_only",
    replyText: "I need one more detail to answer that.",
    followUpQuestion: question,
    recommendedCalls: [],
    ...(notes?.length ? { notes } : {}),
  };
}

function buildOutOfScopeResponse(
  responseVersion: string,
  reason: string,
  notes?: string[],
): ChatResponse {
  return {
    version: responseVersion,
    status: "out_of_scope",
    executionPolicy: "suggest_only",
    replyText: reason,
    outOfScopeReason: reason,
    recommendedCalls: [],
    ...(notes?.length ? { notes } : {}),
  };
}

function formatList(values: string[], emptyLabel: string): string {
  if (!values.length) return emptyLabel;
  return values.slice(0, 6).join(", ");
}

function normalizeSnippet(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n+/g, " ").replace(/[ \t]+/g, " ").trim();
}

function looksLikeMostlyId(text: string): boolean {
  const t = text.trim();
  if (/^[a-f0-9]{24}$/i.test(t)) return true;
  if (/^\d{2,6}$/.test(t)) return true;
  const letters = (t.match(/[a-z]/gi) ?? []).length;
  const digits = (t.match(/[0-9]/g) ?? []).length;
  return digits > 0 && letters === 0;
}
