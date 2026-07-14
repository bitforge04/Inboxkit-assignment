import http       from 'http';
import { Server } from 'socket.io';
import { createApp }      from './app';
import { config }         from './config/env';
import { connectRedis }   from './config/redis';
import { seedGrid, hydrateCache } from './db/seed';
import { registerHandlers }      from './socket/handlers';
import { logger }         from './utils/logger';

async function main() {
  // ── 1. Connect to Redis ────────────────────────────────────────────────────
  await connectRedis();

  // ── 2. Seed DB + hydrate in-memory cache ──────────────────────────────────
  await seedGrid();
  await hydrateCache();

  // ── 3. HTTP + Socket.IO server ─────────────────────────────────────────────
  const app    = createApp();
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: config.corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Allow both WebSocket and long-polling transports
    transports: ['websocket', 'polling'],
    pingInterval: 10_000,
    pingTimeout:  5_000,
  });

  // Register per-socket handlers
  io.on('connection', (socket) => {
    logger.debug(`Socket connected: ${socket.id}`);
    registerHandlers(io, socket);
  });

  // ── 4. Start listening ─────────────────────────────────────────────────────
  server.listen(config.port, () => {
    logger.info(`Server running on http://localhost:${config.port}`);
    logger.info(`Grid: ${config.gridCols}×${config.gridRows} = ${config.gridCols * config.gridRows} cells`);
  });

  // ── 5. Graceful shutdown ───────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down`);
    server.close(async () => {
      await import('./config/prisma').then((m) => m.prisma.$disconnect());
      await import('./config/redis').then((m) => m.redis.quit());
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
