import fs from "fs";
import path from "path";
import { getLiteDashboardAdapter } from "../../adapters/liteDashboardAdapter";
import type { AdapterIntentDefinition } from "../../adapters/adapterTypes";
import { INTENT_CATALOG, type IntentSpec } from "../../intents/intentCatalog";

type EmbeddingSource =
  | "intent_summary"
  | "intent_example"
  | "question_map"
  | "function_catalog"
  | "adapter_intent";

type EmbeddingDocument = {
  id: string;
  source: EmbeddingSource;
  text: string;
  snippet?: string;
  intentId?: string;
  functionName?: string;
  metadata?: Record<string, unknown>;
};

type EmbeddingIndex = {
  model: string;
  builtAt: string;
  documentCount: number;
  embeddingDim: number;
  documents: EmbeddingDocument[];
  embeddings: number[][];
};

type FunctionCatalog = {
  version?: string;
  functions: Array<{
    name: string;
    description?: string;
    recommendable?: boolean;
    readOnly?: boolean;
    tags?: string[];
    aliases?: string[];
    argsSchema?: { required?: string[] };
    returns?: { readTheseFields?: string[] };
  }>;
};

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const OUTPUT_FILENAME = "embeddingIndex.json";
const MAX_TEXT_CHARS = 4000;
const BATCH_SIZE = 16;

async function main(): Promise<void> {
  const repoRoot = findRepoRoot(__dirname);
  const outputPath = path.join(
    repoRoot,
    "chatbot-core",
    "recommender",
    "retrieval",
    OUTPUT_FILENAME,
  );
  ensureDir(path.dirname(outputPath));

  const documents = buildDocuments(repoRoot);
  if (documents.length === 0) {
    throw new Error("No documents were generated for embedding.");
  }

  const modelCacheDir = resolveModelCacheDir(repoRoot);
  const allowRemoteModels = resolveAllowRemoteModels();
  ensureDir(modelCacheDir);
  const extractor = await createEmbedder({ modelCacheDir, allowRemoteModels });
  const embeddings: number[][] = [];
  let embeddingDim = 0;

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = documents.slice(i, i + BATCH_SIZE);
    const texts = batch.map((doc) => doc.text);

    const tensor = await extractor(texts, {
      pooling: "mean",
      normalize: true,
      truncation: true,
    });

    const vectors = tensorToVectors(tensor, batch.length);
    for (const vector of vectors) {
      if (!embeddingDim) embeddingDim = vector.length;
      embeddings.push(vector);
    }

    console.log(
      `Embedded ${Math.min(i + BATCH_SIZE, documents.length)}/${documents.length}`,
    );
  }

  const index: EmbeddingIndex = {
    model: MODEL_NAME,
    builtAt: new Date().toISOString(),
    documentCount: documents.length,
    embeddingDim,
    documents,
    embeddings,
  };

  fs.writeFileSync(outputPath, JSON.stringify(index, null, 2), "utf-8");
  console.log(`Wrote embedding index to: ${outputPath}`);
}

function buildDocuments(repoRoot: string): EmbeddingDocument[] {
  const docs: EmbeddingDocument[] = [];
  const functionCatalog = loadFunctionCatalog(repoRoot);
  const functionIndex = functionCatalog ? indexFunctionCatalog(functionCatalog) : null;
  const adapter = getLiteDashboardAdapter();
  const adapterMethodByFunction = buildAdapterMethodByFunction(adapter);

  docs.push(...buildIntentCatalogDocs(functionIndex, adapterMethodByFunction));
  docs.push(...buildAdapterIntentDocs(adapter, functionIndex));
  docs.push(...buildQuestionMapDocs(repoRoot, functionIndex, adapterMethodByFunction));
  if (functionCatalog && functionIndex) {
    docs.push(
      ...buildFunctionCatalogDocs(functionCatalog, functionIndex, adapterMethodByFunction),
    );
  }

  return dedupeDocuments(docs);
}

function buildIntentCatalogDocs(
  functionIndex: Map<string, FunctionCatalog["functions"][number]> | null,
  adapterMethodByFunction: Map<string, string>,
): EmbeddingDocument[] {
  const docs: EmbeddingDocument[] = [];

  const entries = Object.entries(INTENT_CATALOG) as Array<[string, IntentSpec]>;

  for (const [intentId, spec] of entries) {
    if (!isSafeIntent(spec)) continue;

    const summaryText = normalizeText(
      truncateText(
        [
          `intentId: ${intentId}`,
          `description: ${spec.description}`,
          `requiresLocomotive: ${spec.requiresLoco ? "yes" : "no"}`,
          spec.requiredEntities?.length
            ? `requiredEntities: ${spec.requiredEntities.join(", ")}`
            : "",
          spec.recommendedCalls?.length
            ? `recommendedCalls: ${spec.recommendedCalls
                .map((c) => c.function)
                .join(", ")}`
            : "",
          spec.readTheseFields?.length
            ? `readTheseFields: ${spec.readTheseFields.join(", ")}`
            : "",
          spec.triggerPhrases?.length
            ? `synonyms: ${spec.triggerPhrases.join(", ")}`
            : "",
          spec.exampleQuestions?.length
            ? `examples: ${spec.exampleQuestions.join(" | ")}`
            : "",
          spec.notes ? `notes: ${spec.notes}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        MAX_TEXT_CHARS,
      ),
    );

    docs.push({
      id: `intent:${intentId}:summary`,
      source: "intent_summary",
      intentId,
      text: summaryText,
      snippet: buildIntentSnippet(intentId, spec, functionIndex, adapterMethodByFunction),
      metadata: {
        requiresLoco: spec.requiresLoco,
        safety: spec.safety,
      },
    });

    if (Array.isArray(spec.exampleQuestions)) {
      for (let i = 0; i < spec.exampleQuestions.length; i += 1) {
        const example = spec.exampleQuestions[i].trim();
        if (!example) continue;
        docs.push({
          id: `intent:${intentId}:example:${i}`,
          source: "intent_example",
          intentId,
          text: normalizeText(truncateText(example, MAX_TEXT_CHARS)),
          snippet: buildIntentSnippet(intentId, spec, functionIndex, adapterMethodByFunction),
        });
      }
    }
  }

  return docs;
}

function buildAdapterIntentDocs(
  adapter: ReturnType<typeof getLiteDashboardAdapter>,
  functionIndex: Map<string, FunctionCatalog["functions"][number]> | null,
): EmbeddingDocument[] {
  const docs: EmbeddingDocument[] = [];

  for (const intent of adapter.getIntents()) {
    const mapping = adapter.getMapping(intent.adapterMethod);
    const functionName = mapping?.serviceMapping.functionName;
    const description = mapping?.serviceMapping.description ?? intent.description;

    if (!functionName || !isSafeFunction(functionIndex, functionName)) {
      continue;
    }

    const text = normalizeText(
      truncateText(
        [
          `adapterIntentId: ${intent.id}`,
          `description: ${intent.description}`,
          `adapterMethod: ${intent.adapterMethod}`,
          intent.tags?.length ? `tags: ${intent.tags.join(", ")}` : "",
          intent.canonicalExamples?.length
            ? `examples: ${intent.canonicalExamples.join(" | ")}`
            : "",
          functionName ? `function: ${functionName}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        MAX_TEXT_CHARS,
      ),
    );

    docs.push({
      id: `adapter_intent:${intent.id}`,
      source: "adapter_intent",
      functionName,
      text,
      snippet: buildAdapterIntentSnippet(
        intent,
        functionName,
        mapping?.serviceMapping.readTheseFields ?? [],
        functionIndex,
        description,
      ),
      metadata: {
        adapterIntentId: intent.id,
        adapterMethod: intent.adapterMethod,
      },
    });
  }

  return docs;
}

function buildQuestionMapDocs(
  repoRoot: string,
  functionIndex: Map<string, FunctionCatalog["functions"][number]> | null,
  adapterMethodByFunction: Map<string, string>,
): EmbeddingDocument[] {
  const docs: EmbeddingDocument[] = [];
  const filePath = path.join(repoRoot, "docs", "QUESTION_TO_FUNCTION_MAP.md");

  if (!fs.existsSync(filePath)) {
    console.warn(`QUESTION_TO_FUNCTION_MAP.md not found at ${filePath}`);
    return docs;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const sections = splitQuestionMapSections(content);

  for (const section of sections) {
    if (!section.intentId) continue;
    if (sectionIsMaintenanceOnly(section.text)) continue;
    const spec =
      (INTENT_CATALOG as Record<string, IntentSpec | undefined>)[section.intentId];

    docs.push({
      id: `question_map:${section.intentId}`,
      source: "question_map",
      intentId: section.intentId,
      text: normalizeText(truncateText(section.text, MAX_TEXT_CHARS)),
      snippet: spec
        ? buildIntentSnippet(section.intentId, spec, functionIndex, adapterMethodByFunction)
        : undefined,
    });
  }

  return docs;
}

function buildFunctionCatalogDocs(
  catalog: FunctionCatalog,
  functionIndex: Map<string, FunctionCatalog["functions"][number]>,
  adapterMethodByFunction: Map<string, string>,
): EmbeddingDocument[] {
  const docs: EmbeddingDocument[] = [];

  for (const fn of catalog.functions ?? []) {
    if (!fn.recommendable || !fn.readOnly) continue;

    const text = normalizeText(
      truncateText(
        [
          `function: ${fn.name}`,
          fn.description ? `description: ${fn.description}` : "",
          fn.tags?.length ? `tags: ${fn.tags.join(", ")}` : "",
          fn.aliases?.length ? `aliases: ${fn.aliases.join(", ")}` : "",
          fn.argsSchema?.required?.length
            ? `requiredArgs: ${fn.argsSchema.required.join(", ")}`
            : "",
          fn.returns?.readTheseFields?.length
            ? `readTheseFields: ${fn.returns.readTheseFields.join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
        MAX_TEXT_CHARS,
      ),
    );

    docs.push({
      id: `function:${fn.name}`,
      source: "function_catalog",
      functionName: fn.name,
      text,
      snippet: buildFunctionSnippet(fn.name, fn, adapterMethodByFunction),
      metadata: {
        recommendable: fn.recommendable,
        readOnly: fn.readOnly,
      },
    });
  }

  return docs;
}

function loadFunctionCatalog(repoRoot: string): FunctionCatalog | null {
  const filePath = path.join(repoRoot, "docs", "FUNCTION_CATALOG.json");

  if (!fs.existsSync(filePath)) {
    console.warn(`FUNCTION_CATALOG.json not found at ${filePath}`);
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as FunctionCatalog;
  } catch (err) {
    console.warn(`Failed to parse FUNCTION_CATALOG.json: ${(err as Error).message}`);
    return null;
  }
}

function indexFunctionCatalog(
  catalog: FunctionCatalog,
): Map<string, FunctionCatalog["functions"][number]> {
  const index = new Map<string, FunctionCatalog["functions"][number]>();
  for (const fn of catalog.functions ?? []) {
    index.set(fn.name, fn);
  }
  return index;
}

function isSafeFunction(
  functionIndex: Map<string, FunctionCatalog["functions"][number]> | null,
  functionName: string,
): boolean {
  if (!functionIndex) return false;
  const fn = functionIndex.get(functionName);
  return Boolean(fn && fn.recommendable && fn.readOnly);
}

function buildAdapterMethodByFunction(
  adapter: ReturnType<typeof getLiteDashboardAdapter>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const intent of adapter.getIntents()) {
    const mapping = adapter.getMapping(intent.adapterMethod);
    const functionName = mapping?.serviceMapping.functionName;
    if (!functionName) continue;
    if (!map.has(functionName)) {
      map.set(functionName, intent.adapterMethod);
    }
  }
  return map;
}

function buildIntentSnippet(
  intentId: string,
  spec: IntentSpec,
  functionIndex: Map<string, FunctionCatalog["functions"][number]> | null,
  adapterMethodByFunction: Map<string, string>,
): string {
  const functions = spec.recommendedCalls?.map((call) => call.function).filter(Boolean) ?? [];
  const functionName =
    functions.find((fn) => isSafeFunction(functionIndex, fn)) ?? functions[0] ?? null;
  const adapterMethod = functionName
    ? adapterMethodByFunction.get(functionName) ?? "unknown"
    : "unknown";
  const fnSpec = functionName ? functionIndex?.get(functionName) : undefined;
  const requiredArgs = fnSpec?.argsSchema?.required ?? [];
  const readFields = spec.readTheseFields?.length
    ? spec.readTheseFields
    : fnSpec?.returns?.readTheseFields ?? [];
  const description = spec.description ?? fnSpec?.description ?? "No description available.";

  return buildContextSnippet({
    intentId,
    adapterMethod,
    functionName: functionName ?? undefined,
    requiredArgs,
    readFields,
    description,
  });
}

function buildAdapterIntentSnippet(
  intent: AdapterIntentDefinition,
  functionName: string,
  readFields: string[],
  functionIndex: Map<string, FunctionCatalog["functions"][number]> | null,
  description: string,
): string {
  const fnSpec = functionIndex?.get(functionName);
  const requiredArgs = fnSpec?.argsSchema?.required ?? [];
  const resolvedReadFields =
    readFields.length > 0 ? readFields : fnSpec?.returns?.readTheseFields ?? [];

  return buildContextSnippet({
    intentId: intent.id,
    adapterMethod: intent.adapterMethod,
    functionName,
    requiredArgs,
    readFields: resolvedReadFields,
    description,
  });
}

function buildFunctionSnippet(
  functionName: string,
  fn: FunctionCatalog["functions"][number],
  adapterMethodByFunction: Map<string, string>,
): string {
  const adapterMethod = adapterMethodByFunction.get(functionName) ?? "unknown";
  const requiredArgs = fn.argsSchema?.required ?? [];
  const readFields = fn.returns?.readTheseFields ?? [];
  const description = fn.description ?? "No description available.";

  return buildContextSnippet({
    intentId: "unknown",
    adapterMethod,
    functionName,
    requiredArgs,
    readFields,
    description,
  });
}

function buildContextSnippet(input: {
  intentId?: string;
  adapterMethod?: string;
  functionName?: string;
  requiredArgs?: string[];
  readFields?: string[];
  description?: string;
}): string {
  const intentId = input.intentId ?? "unknown";
  const adapterMethod = input.adapterMethod ?? "unknown";
  const functionName = input.functionName ?? "unknown";
  const requiredArgs = input.requiredArgs ?? [];
  const readFields = input.readFields ?? [];
  const description = input.description
    ? normalizeText(input.description).replace(/\n/g, " ")
    : "No description available.";

  return [
    "ContextPack:",
    `intent=${intentId}`,
    `adapterMethod=${adapterMethod}`,
    `function=${functionName}`,
    `requiredArgs=${formatList(requiredArgs, "none")}`,
    `readFields=${formatList(readFields, "none")}`,
    `description=${description}`,
  ].join("; ");
}

function formatList(values: string[], emptyLabel: string): string {
  if (!values.length) return emptyLabel;
  return values.slice(0, 6).join(", ");
}

function splitQuestionMapSections(
  content: string,
): Array<{ intentId: string; text: string }> {
  const parts = content.split(/\n###\s+/);
  const sections: Array<{ intentId: string; text: string }> = [];

  for (let i = 1; i < parts.length; i += 1) {
    const section = parts[i];
    const [headerLine, ...rest] = section.split("\n");
    const intentId = headerLine.trim();
    const body = rest.join("\n").trim();
    if (!intentId || !body) continue;
    sections.push({
      intentId,
      text: `### ${intentId}\n${body}`,
    });
  }

  return sections;
}

function sectionIsMaintenanceOnly(text: string): boolean {
  return /\bmaintenance_only\b/i.test(text);
}

function isSafeIntent(spec: IntentSpec): boolean {
  return spec.safety === "safe";
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 12).trim()}... (truncated)`;
}

function dedupeDocuments(docs: EmbeddingDocument[]): EmbeddingDocument[] {
  const seen = new Set<string>();
  const out: EmbeddingDocument[] = [];

  for (const doc of docs) {
    const key = `${doc.source}|${doc.intentId ?? ""}|${doc.functionName ?? ""}|${doc.text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(doc);
  }

  return out;
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resolveModelCacheDir(repoRoot: string): string {
  return process.env.TRANSFORMERS_CACHE ?? path.join(repoRoot, ".cache", "transformers");
}

function resolveAllowRemoteModels(): boolean {
  const raw = process.env.TRANSFORMERS_ALLOW_REMOTE;
  if (!raw) return false;
  return raw === "1" || raw.toLowerCase() === "true";
}

function findRepoRoot(startDir: string): string {
  let current = startDir;
  const root = path.parse(current).root;

  while (current !== root) {
    const marker = path.join(current, "docs", "QUESTION_TO_FUNCTION_MAP.md");
    if (fs.existsSync(marker)) return current;
    current = path.dirname(current);
  }

  throw new Error("Unable to locate repo root (missing docs/QUESTION_TO_FUNCTION_MAP.md).");
}

type EmbedderConfig = {
  modelCacheDir: string;
  allowRemoteModels: boolean;
};

async function createEmbedder(
  config: EmbedderConfig,
): Promise<(input: string | string[], options?: Record<string, unknown>) => Promise<unknown>> {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = config.modelCacheDir;
  env.allowRemoteModels = config.allowRemoteModels;
  return pipeline("feature-extraction", MODEL_NAME);
}

function tensorToVectors(tensor: unknown, expectedRows: number): number[][] {
  const output = tensor as {
    tolist?: () => unknown;
    data?: Float32Array | number[];
  };

  if (output?.tolist) {
    const list = output.tolist();
    if (Array.isArray(list) && Array.isArray(list[0])) {
      return list as number[][];
    }
    if (Array.isArray(list) && typeof list[0] === "number") {
      return [list as number[]];
    }
  }

  const data: number[] = output?.data ? Array.from(output.data) : [];
  if (!data.length) {
    throw new Error("Unsupported embedding output format (no tolist() or data).");
  }

  const dim = Math.floor(data.length / expectedRows);
  if (!dim || dim * expectedRows !== data.length) {
    return [data];
  }

  const out: number[][] = [];
  for (let i = 0; i < expectedRows; i += 1) {
    out.push(data.slice(i * dim, (i + 1) * dim));
  }
  return out;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
