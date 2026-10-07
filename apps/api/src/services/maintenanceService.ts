import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { generationQueue } from '../queues/generationQueue.js';
import { requeueItems } from './generationService.js';
import { localExportDir } from './exportService.js';

const STALE_AFTER_MS = Number(process.env.STALE_ITEM_MINUTES ?? 15) * 60_000;
const SWEEP_INTERVAL_MS = Number(process.env.MAINTENANCE_INTERVAL_MINUTES ?? 5) * 60_000;

/**
 * Finds generation items that are not finished but have no job in the queue —
 * which is what is left behind if Redis loses its data, or a job is removed by
 * hand. Without this they would show "in progress" forever. They are put back
 * on the queue; the worker then carries on from the item's saved state.
 *
 * An item counts as stuck only if nothing has touched it for STALE_ITEM_MINUTES
 * (default 15) AND no waiting/active/delayed job refers to it.
 */
export async function requeueOrphanedItems(now = Date.now()): Promise<number> {
  const stale = await prisma.generationItem.findMany({
    where: {
      status: { in: ['QUEUED', 'GENERATING', 'VALIDATING'] },
      updatedAt: { lt: new Date(now - STALE_AFTER_MS) },
      batch: { cancelledAt: null },
    },
    select: { id: true },
    take: 500,
  });
  if (stale.length === 0) return 0;

  const live = await generationQueue.getJobs(['waiting', 'active', 'delayed', 'prioritized', 'waiting-children']);
  const queued = new Set(live.map((job) => job?.data?.itemId).filter(Boolean));
  const orphans = stale.map((i) => i.id).filter((id) => !queued.has(id));
  if (orphans.length === 0) return 0;

  // Touch them first so the next sweep does not queue them a second time while they wait.
  await prisma.generationItem.updateMany({ where: { id: { in: orphans } }, data: { stage: 'Re-queued after losing its job' } });
  await requeueItems(orphans);
  logger.warn(`[Maintenance] Re-queued ${orphans.length} generation item(s) that had no queue job.`);
  return orphans.length;
}

/** Deletes locally stored export files whose download link has expired. */
export async function deleteExpiredLocalExports(now = Date.now()): Promise<number> {
  const expired = await prisma.exportRecord.findMany({
    where: { storageKey: { not: null }, expiresAt: { lt: new Date(now) } },
    select: { id: true, storageKey: true },
    take: 500,
  });
  for (const record of expired) {
    await unlink(path.join(localExportDir(), path.basename(record.storageKey!))).catch(() => {}); // already gone is fine
  }
  if (expired.length > 0) {
    await prisma.exportRecord.updateMany({ where: { id: { in: expired.map((e) => e.id) } }, data: { storageKey: null } });
    logger.info(`[Maintenance] Deleted ${expired.length} expired export file(s).`);
  }
  return expired.length;
}

export async function runMaintenance(): Promise<void> {
  for (const task of [requeueOrphanedItems, deleteExpiredLocalExports]) {
    try {
      await task();
    } catch (err: any) {
      logger.error(`[Maintenance] ${task.name} failed`, { error: err.message });
    }
  }
}

/** Runs the housekeeping tasks now and then every MAINTENANCE_INTERVAL_MINUTES. Returns a stop function. */
export function startMaintenance(): () => void {
  void runMaintenance();
  const timer = setInterval(() => void runMaintenance(), SWEEP_INTERVAL_MS);
  timer.unref();
  logger.info(`🧹 Maintenance sweeper started (every ${SWEEP_INTERVAL_MS / 60_000} min)`);
  return () => clearInterval(timer);
}
