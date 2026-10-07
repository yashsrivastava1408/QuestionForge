import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

const VECTOR_DIMENSION = 256;
const DUPLICATE_THRESHOLD = 0.88;

// Common programming and question prompt stopwords to avoid bias
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'you', 'your', 'we', 'our', 'it', 'its', 'they', 'their',
  'given', 'return', 'write', 'function', 'program', 'algorithm', 'input', 'output',
  'example', 'constraints', 'note', 'such', 'that', 'find', 'determine',
]);

/**
 * Deterministic Feature Hashing (Hashing Trick) Embedding:
 * 1. Tokenizes and filters stopwords.
 * 2. Hashes each token uniformly into a fixed 256-dimensional space using 32-bit FNV-1a.
 * 3. Applies sublinear term-frequency weighting (1 + ln(count)).
 * 4. L2-normalizes the vector so dot product directly yields cosine similarity.
 */
export function computeEmbedding(text: string): number[] {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));

  const vector = new Array<number>(VECTOR_DIMENSION).fill(0);
  if (tokens.length === 0) return vector;

  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  for (const [token, count] of counts.entries()) {
    // 32-bit FNV-1a hash
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const bucket = Math.abs(hash) % VECTOR_DIMENSION;
    // Sublinear term frequency weighting
    const weight = 1 + Math.log(count);
    vector[bucket] += weight;
  }

  // L2-normalization
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vector;

  return vector.map((v) => Number((v / magnitude).toFixed(6)));
}

/**
 * Cosine similarity between two L2-normalized vectors (dot product).
 */
function cosineSimilarityNormalized(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return Math.max(0, Math.min(1, dot));
}

/** How many of the organization's most recent questions a new draft is compared against. */
const SCAN_WINDOW = Number(process.env.DEDUP_SCAN_WINDOW ?? 5000);

export interface DuplicateMatch {
  id: string;
  title: string;
  similarity: number;
}

/**
 * Compares a statement against the organization's question bank and returns the
 * closest match at or above the duplicate threshold, or null.
 *
 * This is LEXICAL similarity (shared vocabulary), not semantic: it catches
 * reworded copies of the same statement, not the same problem told as a
 * different story. Questions that are still being validated are included so
 * parallel jobs in one batch cannot produce twins; FAILED ones are not.
 */
export async function findDuplicate(
  statement: string,
  organizationId: string,
  excludeQuestionId?: string | null
): Promise<DuplicateMatch | null> {
  try {
    const embedding = computeEmbedding(statement);

    const existing = await prisma.question.findMany({
      where: {
        organizationId,
        status: { not: 'FAILED' },
        NOT: { embeddingVector: { isEmpty: true } },
        ...(excludeQuestionId && { id: { not: excludeQuestionId } }),
      },
      select: { id: true, title: true, embeddingVector: true },
      take: SCAN_WINDOW,
      orderBy: { createdAt: 'desc' },
    });

    let best: DuplicateMatch | null = null;
    for (const q of existing) {
      const qVector = q.embeddingVector as number[];
      if (!Array.isArray(qVector) || qVector.length !== VECTOR_DIMENSION) continue;

      const similarity = cosineSimilarityNormalized(embedding, qVector);
      if (similarity >= DUPLICATE_THRESHOLD && (!best || similarity > best.similarity)) {
        best = { id: q.id, title: q.title, similarity };
      }
    }

    if (best) {
      logger.warn(
        `[Deduplication] Duplicate detected (similarity: ${best.similarity.toFixed(3)}) with existing question '${best.title}' (${best.id})`
      );
    }
    return best;
  } catch (err: any) {
    logger.error('[Deduplication] Check failed, falling open', { error: err.message });
    return null; // Fail open — don't block generation on dedup error
  }
}
