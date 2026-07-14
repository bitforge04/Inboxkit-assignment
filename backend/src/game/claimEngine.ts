/**
 * Core claim-processing logic.
 *
 * Entry point: claimCell()
 *
 * Flow:
 *   1. Validate cellId bounds
 *   2. Acquire per-cell lock (serialises concurrent claims on the same cell)
 *   3. Inside lock:
 *      a. Check user cooldown (Redis TTL key)
 *      b. Re-read cell from cache
 *      c. Reject if already owned by requester
 *      d. Determine steal vs. fresh claim
 *      e. DB write with optimistic version check (UPDATE … WHERE version = $v)
 *         — if another request already incremented the version the UPDATE
 *           affects 0 rows → retry from step b (up to MAX_RETRIES)
 *      f. Update in-memory cache
 *      g. Set new cooldown in Redis
 *   4. Return result to socket handler for broadcast
 */

import { prisma }        from '../config/prisma';
import { redis }         from '../config/redis';
import { config }        from '../config/env';
import { gridCache }     from './gridCache';
import { cellLocks }     from './cellLock';
import { logger }        from '../utils/logger';
import { CellState, ClaimRejectedPayload, CellUpdatedPayload } from '../types';

const MAX_RETRIES = 3;

// Redis key for per-user cooldown
const cooldownKey = (userId: string) => `cooldown:${userId}`;

export type ClaimResult =
  | { ok: true;  update: CellUpdatedPayload; prevOwnerId: string | null }
  | { ok: false; rejection: ClaimRejectedPayload };

export async function claimCell(
  userId: string,
  cellId: number
): Promise<ClaimResult> {

  // ── 1. Bounds check ────────────────────────────────────────────────────────
  if (!gridCache.isValidCellId(cellId)) {
    return {
      ok: false,
      rejection: { cellId, reason: 'invalid_cell' },
    };
  }

  // ── 2. Per-cell lock ───────────────────────────────────────────────────────
  return cellLocks.withLock(cellId, async () => {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {

      // ── 3a. Cooldown check ────────────────────────────────────────────────
      const ttl = await redis.pttl(cooldownKey(userId));
      if (ttl > 0) {
        return {
          ok: false,
          rejection: { cellId, reason: 'cooldown', cooldownMs: ttl },
        } satisfies ClaimResult;
      }

      // ── 3b. Current cell state ────────────────────────────────────────────
      const cell = gridCache.getCell(cellId)!;

      // ── 3c. Already owned by requester ────────────────────────────────────
      if (cell.ownerId === userId) {
        return {
          ok: false,
          rejection: { cellId, reason: 'already_owned' },
        } satisfies ClaimResult;
      }

      const isSteal   = cell.ownerId !== null;
      const cooldownMs = isSteal ? config.stealCooldownMs : config.claimCooldownMs;
      const now        = new Date();
      const user       = gridCache.getUser(userId)!;

      // ── 3d/3e. Atomic DB write with optimistic version check ──────────────
      // If two concurrent requests both read version=N and try to UPDATE,
      // only one will match the WHERE version=$N clause; the other gets 0 rows.
      const result = await prisma.$executeRaw`
        UPDATE cells
        SET
          "ownerId"   = ${userId},
          color       = ${user.color},
          "claimedAt" = ${now},
          version     = version + 1,
          "updatedAt" = ${now}
        WHERE id = ${cellId}
          AND version = ${cell.version}
      `;

      if (result === 0) {
        // Another request won the race — reload cache from DB and retry
        const fresh = await prisma.cell.findUnique({ where: { id: cellId } });
        if (fresh) {
          gridCache.updateCell({
            id: fresh.id,
            ownerId: fresh.ownerId,
            color: fresh.color,
            claimedAt: fresh.claimedAt?.toISOString() ?? null,
            version: fresh.version,
          });
        }
        logger.debug(`claimCell: version conflict on cell ${cellId}, retry ${attempt + 1}`);
        continue; // retry
      }

      // ── 3f. Update in-memory cache ─────────────────────────────────────────
      const prevOwnerId = cell.ownerId;
      const newCell: CellState = {
        id: cellId,
        ownerId: userId,
        color: user.color,
        claimedAt: now.toISOString(),
        version: cell.version + 1,
      };
      gridCache.updateCell(newCell);

      // Update cell counts
      if (prevOwnerId && prevOwnerId !== userId) {
        gridCache.decrementUserCells(prevOwnerId);
        await prisma.user.update({
          where: { id: prevOwnerId },
          data: { cellsOwned: { decrement: 1 } },
        }).catch(() => {/* non-critical */});
      }
      gridCache.incrementUserCells(userId);
      await prisma.user.update({
        where: { id: userId },
        data: { cellsOwned: { increment: 1 }, lastClaimAt: now },
      }).catch(() => {/* non-critical */});

      // ── 3g. Set cooldown in Redis ──────────────────────────────────────────
      await redis.set(cooldownKey(userId), '1', 'PX', cooldownMs);

      const update: CellUpdatedPayload = {
        cellId,
        ownerId: userId,
        color: user.color,
        claimedAt: now.toISOString(),
        version: newCell.version,
        displayName: user.displayName,
      };

      return { ok: true, update, prevOwnerId } satisfies ClaimResult;
    }

    // Exhausted retries — extremely unlikely under normal load
    logger.warn(`claimCell: exhausted retries for cell ${cellId}`);
    return {
      ok: false,
      rejection: { cellId, reason: 'server_error' },
    } satisfies ClaimResult;
  });
}
