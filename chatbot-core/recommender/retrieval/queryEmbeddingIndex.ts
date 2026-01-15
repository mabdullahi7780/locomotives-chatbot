import fs from "fs";
import path from "path";

type EmbeddingSource =
  | "intent_summary"
  | "intent_example"
  | "question_map"
  | "function_catalog"
  | "adapter_intent";

export type EmbeddingDocument = {
  id: string;
  source: EmbeddingSource;
  text: string;
  snippet?: string;
  intentId?: string;
  functionName?: string;
  metadata?: Record<string, unknown>;
};

export type EmbeddingIndex = {
  model: string;
  builtAt: string;
  documentCount: number;
  embeddingDim: number;
  documents: EmbeddingDocument[];
  embeddings: number[][];
};

export type RetrievalHit = {
  score: number;
  doc: EmbeddingDocument;
};

export type QueryEmbeddingIndexOptions = {
  /** Absolute path is safest (recommended in production). */
  indexPath?: string;
  /** Default: 3 */
  topK?: number;
  /**
   * Similarity threshold to treat retrieval as “no confident match”.
   * Tune with tests. Default is conservative-ish.
   */
  minScore?: number;
  /**
   * Where transformers should cache/load models.
   * Use the same value in buildEmbeddingIndex.ts for consistency.
   */
  modelCacheDir?: string;
  /**
   * For runtime safety: default false (no network).
   * If you haven't cached the model yet, set true once to populate cache.
   */
  allowRemoteModels?: boolean;
};

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const MAX_TEXT_CHARS = 4000;

let cachedIndex: EmbeddingIndex | null = null;
let cachedEmbeddingsF32: Float32Array[] | null = null;
let cachedEmbedder:
  | ((input: string | string[], options?: Record<string, unknown>) => Promise<unknown>)
  | null = null;
let cachedEmbedderConfigKey: string | null = null;

export async function queryEmbeddingIndex(
  userText: string,
  opts: QueryEmbeddingIndexOptions = {},
): Promise<RetrievalHit[]> {
  const topK = opts.topK ?? 3;
  const minScore = opts.minScore ?? 0.35;

  const text = normalizeText(truncateText(userText, MAX_TEXT_CHARS));
  if (!text) return [];

  if (looksLikeMostlyId(text)) return [];

  const index = loadIndex(opts.indexPath);
  if (index.model !== MODEL_NAME) {
    console.warn(
      `Embedding model mismatch. Index uses "${index.model}" but runtime expects "${MODEL_NAME}".`,
    );
  }

  const embedder = await getEmbedder(opts);
  const vector = await embedText(embedder, text);
  if (vector.length !== index.embeddingDim) {
    console.warn(
      `Embedding dim mismatch. Query dim ${vector.length} vs index dim ${index.embeddingDim}.`,
    );
    return [];
  }

  const q = Float32Array.from(vector);
  const embF32 = getEmbeddingsF32(index);

  const hits: RetrievalHit[] = [];
  for (let i = 0; i < embF32.length; i += 1) {
    const score = dot(q, embF32[i]);
    if (score >= minScore) hits.push({ score, doc: index.documents[i] });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, topK);
}

export function resetEmbeddingIndexCache(): void {
  cachedIndex = null;
  cachedEmbeddingsF32 = null;
}

function loadIndex(indexPathOverride?: string): EmbeddingIndex {
  if (cachedIndex) return cachedIndex;

  const indexPath = resolveIndexPath(indexPathOverride);
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Embedding index not found at: ${indexPath}`);
  }

  const raw = fs.readFileSync(indexPath, "utf-8");
  const parsed = JSON.parse(raw) as EmbeddingIndex;

  if (!Array.isArray(parsed.documents) || !Array.isArray(parsed.embeddings)) {
    throw new Error("Invalid embedding index: missing documents/embeddings arrays.");
  }
  if (parsed.documents.length !== parsed.embeddings.length) {
    throw new Error(
      `Invalid embedding index: documents (${parsed.documents.length}) != embeddings (${parsed.embeddings.length}).`,
    );
  }
  if (parsed.embeddingDim <= 0) {
    throw new Error("Invalid embedding index: embeddingDim must be > 0.");
  }

  cachedIndex = parsed;
  return parsed;
}

function resolveIndexPath(indexPathOverride?: string): string {
  if (indexPathOverride) return indexPathOverride;

  const sameDir = path.resolve(__dirname, "embeddingIndex.json");
  if (fs.existsSync(sameDir)) return sameDir;

  const candidates = [
    path.resolve(process.cwd(), "recommender", "retrieval", "embeddingIndex.json"),
    path.resolve(
      process.cwd(),
      "chatbot-core",
      "recommender",
      "retrieval",
      "embeddingIndex.json",
    ),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  try {
    const repoRoot = findRepoRoot(__dirname);
    const repoCandidates = [
      path.join(repoRoot, "recommender", "retrieval", "embeddingIndex.json"),
      path.join(repoRoot, "chatbot-core", "recommender", "retrieval", "embeddingIndex.json"),
    ];
    for (const candidate of repoCandidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    // Fall through to return candidates[0].
  }

  return candidates[0];
}

function getEmbeddingsF32(index: EmbeddingIndex): Float32Array[] {
  if (cachedEmbeddingsF32) return cachedEmbeddingsF32;

  cachedEmbeddingsF32 = index.embeddings.map((v, i) => {
    if (!Array.isArray(v) || v.length !== index.embeddingDim) {
      throw new Error(
        `Invalid embedding vector at i=${i}: expected dim ${index.embeddingDim}, got ${v?.length}`,
      );
    }
    return Float32Array.from(v);
  });

  return cachedEmbeddingsF32;
}

async function getEmbedder(
  opts: QueryEmbeddingIndexOptions,
): Promise<(input: string | string[], options?: Record<string, unknown>) => Promise<unknown>> {
  const modelCacheDir = resolveModelCacheDir(opts.modelCacheDir);
  const allowRemote = resolveAllowRemoteModels(opts.allowRemoteModels);
  const configKey = `${MODEL_NAME}|${modelCacheDir}|${allowRemote}`;

  if (cachedEmbedder && cachedEmbedderConfigKey === configKey) return cachedEmbedder;

  const { pipeline, env } = await import("@huggingface/transformers");
  ensureDir(modelCacheDir);
  env.cacheDir = modelCacheDir;
  env.allowRemoteModels = allowRemote;

  cachedEmbedder = await pipeline("feature-extraction", MODEL_NAME);
  cachedEmbedderConfigKey = configKey;
  return cachedEmbedder;
}

async function embedText(
  embedder: (input: string | string[], options?: Record<string, unknown>) => Promise<unknown>,
  text: string,
): Promise<number[]> {
  const output = await embedder(text, {
    pooling: "mean",
    normalize: true,
    truncation: true,
  });
  return tensorToVector(output);
}

function tensorToVector(tensor: unknown): number[] {
  const output = tensor as {
    tolist?: () => unknown;
    data?: Float32Array | number[];
  };

  if (output?.tolist) {
    const list = output.tolist();
    if (Array.isArray(list) && Array.isArray(list[0])) {
      const first = list[0] as unknown[];
      if (typeof first[0] === "number") return first as number[];
    }
    if (Array.isArray(list) && typeof list[0] === "number") {
      return list as number[];
    }
  }

  const data: number[] = output?.data ? Array.from(output.data) : [];
  if (!data.length) {
    throw new Error("Unsupported embedding output format (no tolist() or data).");
  }
  return data;
}

function dot(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i += 1) s += a[i] * b[i];
  return s;
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

function looksLikeMostlyId(text: string): boolean {
  const t = text.trim();
  if (/^[a-f0-9]{24}$/i.test(t)) return true;
  if (/^\d{2,6}$/.test(t)) return true;
  const letters = (t.match(/[a-z]/gi) ?? []).length;
  const digits = (t.match(/[0-9]/g) ?? []).length;
  return digits > 0 && letters === 0;
}

function resolveModelCacheDir(override?: string): string {
  if (override) return override;
  if (process.env.TRANSFORMERS_CACHE) return process.env.TRANSFORMERS_CACHE;
  try {
    const repoRoot = findRepoRoot(__dirname);
    return path.join(repoRoot, ".cache", "transformers");
  } catch {
    return path.resolve(process.cwd(), ".cache", "transformers");
  }
}

function resolveAllowRemoteModels(override?: boolean): boolean {
  if (override !== undefined) return override;
  const raw = process.env.TRANSFORMERS_ALLOW_REMOTE;
  if (!raw) return false;
  return raw === "1" || raw.toLowerCase() === "true";
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
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
