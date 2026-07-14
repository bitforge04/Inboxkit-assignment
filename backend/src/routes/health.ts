import { Router, Request, Response } from 'express';
import { prisma }    from '../config/prisma';
import { redis }     from '../config/redis';
import { gridCache } from '../game/gridCache';
import { cellLocks } from '../game/cellLock';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redisPing = await redis.ping();

    res.json({
      status: 'ok',
      db: 'ok',
      redis: redisPing === 'PONG' ? 'ok' : 'degraded',
      activeLocks: cellLocks.activeLocks,
      users: gridCache.getAllUsers().length,
    });
  } catch (err) {
    res.status(503).json({ status: 'error', err: String(err) });
  }
});

export default router;
