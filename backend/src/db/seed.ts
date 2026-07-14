/**
 * Idempotent grid seeder — creates GRID_SIZE cell rows if they don't exist.
 * Called at server startup before accepting connections.
 */

import { prisma }   from '../config/prisma';
import { gridCache } from '../game/gridCache';
import { config, GRID_SIZE } from '../config/env';
import { logger }   from '../utils/logger';

export async function seedGrid(): Promise<void> {
  // Insert any missing cells (upsert so it's safe to run multiple times)
  const ids = Array.from({ length: GRID_SIZE }, (_, i) => i);

  await prisma.$transaction(
    ids.map((id) =>
      prisma.cell.upsert({
        where: { id },
        create: { id, updatedAt: new Date() },
        update: {},
      })
    ),
    { isolationLevel: 'Serializable' }
  );

  logger.info(`DB: ensured ${GRID_SIZE} cells exist (${config.gridCols}×${config.gridRows})`);
}

export async function hydrateCache(): Promise<void> {
  const [cells, users] = await Promise.all([
    prisma.cell.findMany({ orderBy: { id: 'asc' } }),
    prisma.user.findMany(),
  ]);

  gridCache.loadCells(
    cells.map((c) => ({
      id: c.id,
      ownerId: c.ownerId,
      color: c.color,
      claimedAt: c.claimedAt?.toISOString() ?? null,
      version: c.version,
    }))
  );

  gridCache.loadUsers(
    users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      color: u.color,
      cellsOwned: u.cellsOwned,
    }))
  );
}
