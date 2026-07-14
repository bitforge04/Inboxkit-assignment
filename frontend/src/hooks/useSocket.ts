/**
 * Manages the Socket.IO connection lifecycle and maps events to store actions.
 * Returns a stable `claimCell` function the canvas can call on click.
 */

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGameStore } from '../store/gameStore';
import type {
  GridStatePayload,
  CellUpdatedPayload,
  ClaimRejectedPayload,
  UserCountPayload,
  LeaderboardUpdatePayload,
} from '../types';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? '';

const TOKEN_KEY = 'grid_user_token';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const store = useGameStore();

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      store.setConnected(true);
      const token = localStorage.getItem(TOKEN_KEY) ?? undefined;
      socket.emit('join', { token });
    });

    socket.on('disconnect', () => {
      store.setConnected(false);
    });

    socket.on('grid_state', (payload: GridStatePayload) => {
      store.setGridState(payload);
      // Persist userId for reconnects
      localStorage.setItem(TOKEN_KEY, payload.user.id);
    });

    socket.on('cell_updated', (payload: CellUpdatedPayload) => {
      store.removePending(payload.cellId);

      store.updateCell({
        id: payload.cellId,
        ownerId: payload.ownerId,
        color: payload.color,
        claimedAt: payload.claimedAt,
        version: payload.version,
      });

      // Trigger claim animation
      store.addAnimation({
        cellId: payload.cellId,
        startTime: performance.now(),
        duration: 600,
        type: 'claim',
        color: payload.color,
      });

      // Update my cell count if it was my claim
      const me = useGameStore.getState().me;
      if (me && payload.ownerId === me.id) {
        // Count is updated server-side; leaderboard update will carry new count
      }
    });

    socket.on('claim_rejected', (payload: ClaimRejectedPayload) => {
      store.removePending(payload.cellId);

      // Revert optimistic update — just remove pending, server state is already correct
      store.removePending(payload.cellId);

      // Rejection animation
      store.addAnimation({
        cellId: payload.cellId,
        startTime: performance.now(),
        duration: 400,
        type: 'reject',
        color: '#ef4444',
      });

      // Toast feedback
      if (payload.reason === 'cooldown') {
        const remaining = Math.ceil((payload.cooldownMs ?? 0) / 1000);
        store.pushToast({
          message: `Cooldown! Wait ${remaining}s`,
          type: 'error',
        });
        store.setCooldownUntil(Date.now() + (payload.cooldownMs ?? 0));
      } else if (payload.reason === 'already_owned') {
        store.pushToast({ message: "That's already yours!", type: 'info' });
      } else if (payload.reason === 'invalid_cell') {
        store.pushToast({ message: 'Invalid cell', type: 'error' });
      } else {
        store.pushToast({ message: 'Server beat you to it!', type: 'info' });
      }
    });

    socket.on('user_count', (payload: UserCountPayload) => {
      store.setUserCount(payload.count);
    });

    socket.on('leaderboard_update', (payload: LeaderboardUpdatePayload) => {
      store.setLeaderboard(payload.leaderboard);
      // Update my cell count from leaderboard
      const me = useGameStore.getState().me;
      if (me) {
        const entry = payload.leaderboard.find((e) => e.userId === me.id);
        if (entry) store.updateMe({ cellsOwned: entry.cellsOwned });
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const claimCell = useCallback((cellId: number) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;

    const state = useGameStore.getState();
    const me = state.me;
    if (!me) return;

    // Cooldown gate on client (server still validates)
    if (Date.now() < state.cooldownUntil) {
      const remaining = Math.ceil((state.cooldownUntil - Date.now()) / 1000);
      state.pushToast({ message: `Cooldown! Wait ${remaining}s`, type: 'error' });
      return;
    }

    // Set cooldown immediately so the bar shows on the very first click.
    // Mirror server defaults: 2s for a fresh claim, 5s for a steal.
    const targetCell = state.cells[cellId];
    const isSteal = targetCell?.ownerId != null;
    const COOLDOWN_MS = isSteal ? 5000 : 2000;
    state.setCooldownUntil(Date.now() + COOLDOWN_MS);

    // Optimistic update
    state.addPending(cellId);
    state.addAnimation({
      cellId,
      startTime: performance.now(),
      duration: 200,
      type: 'optimistic',
      color: me.color,
    });

    socket.emit('claim_cell', { cellId });
  }, []);

  return { claimCell };
}
