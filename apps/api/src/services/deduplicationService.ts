import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

// Cosine similarity between two float vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}

// Simple TF-IDF style embedding for dedup (production: use a real embedding model)
function simpleEmbed(text: string): number[] {
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  const vocab = new Set(words);
  const vector: number[] = [];
  const counts = new Map<string, number>();
  words.forEach(w => counts.set(w, (counts.get(w) ?? 0) + 1));
  vocab.forEach(w => vector.push((counts.get(w) ?? 0) / words.length));
  // Pad to fixed size 256
  while (vector.length < 256) vector.push(0);
  return vector.slice(0, 256);
}

const DUPLICATE_THRESHOLD = 0.90;

export async function checkDuplicate(statement: string, organizationId: string): Promise<boolean> {
  try {
    const embedding = simpleEmbed(statement);

    // Fetch existing question embeddings for this org
    const existing = await prisma.question.findMany({
      where: { organizationId, NOT: { embeddingVector: { isEmpty: true } } },
      select: { id: true, embeddingVector: true },
    });

    for (const q of existing) {
      const sim = cosineSimilarity(embedding, q.embeddingVector as number[]);
      if (sim >= DUPLICATE_THRESHOLD) {
        logger.warn(`Duplicate detected (similarity: ${sim.toFixed(3)}) with question ${q.id}`);
        return true;
      }
    }

    return false;
  } catch (err: any) {
    logger.error('Deduplication check failed', { error: err.message });
    return false; // Fail open — don't block generation on dedup error
  }
}

export async function storeEmbedding(questionId: string, statement: string): Promise<void> {
  const embedding = simpleEmbed(statement);
  await prisma.question.update({
    where: { id: questionId },
    data: { embeddingVector: embedding },
  });
}
