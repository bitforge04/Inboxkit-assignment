/**
 * Socket.IO event handlers.
 *
 * One file, one concern: translate raw socket events into game actions,
 * then broadcast results.  All business logic lives in claimEngine.ts.
 */

import type { Server, Socket } from 'socket.io';
import { prisma }        from '../config/prisma';
import { gridCache }     from '../game/gridCache';
import { claimCell }     from '../game/claimEngine';
import { generateDisplayName } from '../utils/nameGenerator';
import { userColor }     from '../utils/colorGenerator';
import { logger }        from '../utils/logger';
import { config }        from '../config/env';
import {
  EVENTS,
  JoinPayload,
  ClaimCellPayload,
  GridStatePayload,
} from '../types';

// Track connected socket count
let connectedCount = 0;

export function registerHandlers(io: Server, socket: Socket): void {
  // ── join ────────────────────────────────────────────────────────────────────
  socket.on(EVENTS.JOIN, async (payload: JoinPayload) => {
    try {
      const existingToken = typeof payload?.token === 'string' ? payload.token.trim() : null;

      let user = existingToken ? gridCache.getUser(existingToken) : null;

      // If not in cache, check DB (handles reconnects after server restart)
      if (!user && existingToken) {
        const dbUser = await prisma.user.findUnique({ where: { id: existingToken } });
        if (dbUser) {
          user = {
            id: dbUser.id,
            displayName: dbUser.displayName,
            color: dbUser.color,
            cellsOwned: dbUser.cellsOwned,
          };
          gridCache.setUser(user);
        }
      }

      // New user
      if (!user) {
        const color = userColor(socket.id); // use socket id as seed for new users
        const displayName = generateDisplayName();
        const created = await prisma.user.create({
          data: {
            displayName,
            color,
            cellsOwned: 0,
          },
        });
        user = {
          id: created.id,
          displayName: created.displayName,
          color: created.color,
          cellsOwned: created.cellsOwned,
        };
        gridCache.setUser(user);
      }

      // Bind userId to socket for later handlers
      (socket as SocketWithUser).userId = user.id;

      connectedCount++;
      logger.info(`User joined: ${user.displayName} (${user.id}) — total: ${connectedCount}`);

      // Send full grid snapshot to joining client
      const gridPayload: GridStatePayload = {
        cells: gridCache.getAllCells(),
        user,
        userCount: connectedCount,
        leaderboard: gridCache.getLeaderboard(config.leaderboardSize),
        gridCols: config.gridCols,
        gridRows: config.gridRows,
      };
      socket.emit(EVENTS.GRID_STATE, gridPayload);

      // Broadcast updated user count to everyone
      io.emit(EVENTS.USER_COUNT, { count: connectedCount });

    } catch (err) {
      logger.error('join handler error', { err });
      socket.emit('error', { message: 'Failed to join' });
    }
  });

  // ── claim_cell ──────────────────────────────────────────────────────────────
  socket.on(EVENTS.CLAIM_CELL, async (payload: ClaimCellPayload) => {
    try {
      const userId = (socket as SocketWithUser).userId;
      if (!userId) {
        socket.emit(EVENTS.CLAIM_REJECTED, { cellId: -1, reason: 'server_error' });
        return;
      }

      // Input validation — never trust client-supplied cellId
      const cellId = Number(payload?.cellId);
      if (!Number.isFinite(cellId) || !gridCache.isValidCellId(cellId)) {
        socket.emit(EVENTS.CLAIM_REJECTED, { cellId, reason: 'invalid_cell' });
        return;
      }

      const result = await claimCell(userId, cellId);

      if (!result.ok) {
        socket.emit(EVENTS.CLAIM_REJECTED, result.rejection);
        return;
      }

      // Broadcast the cell update to ALL connected clients (including sender)
      io.emit(EVENTS.CELL_UPDATED, result.update);

      // Broadcast updated leaderboard
      const leaderboard = gridCache.getLeaderboard(config.leaderboardSize);
      io.emit(EVENTS.LEADERBOARD_UPDATE, { leaderboard });

      logger.debug(
        `Cell ${cellId} claimed by ${result.update.displayName}` +
        (result.prevOwnerId ? ` (stolen from ${result.prevOwnerId})` : '')
      );

    } catch (err) {
      logger.error('claim_cell handler error', { err });
      socket.emit(EVENTS.CLAIM_REJECTED, { cellId: payload?.cellId ?? -1, reason: 'server_error' });
    }
  });

  // ── disconnect ──────────────────────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    const userId = (socket as SocketWithUser).userId;
    connectedCount = Math.max(0, connectedCount - 1);
    logger.info(`Socket disconnected: ${userId ?? 'unknown'} — reason: ${reason} — total: ${connectedCount}`);
    io.emit(EVENTS.USER_COUNT, { count: connectedCount });
  });
}

// Augment Socket type to carry userId
interface SocketWithUser extends Socket {
  userId?: string;
}
