/**
 * Zustand store — all reactive UI state lives here.
 * Canvas reads directly from this store via selectors.
 */

import { create } from 'zustand';
import {
  CellState,
  UserState,
  LeaderboardEntry,
  CellAnimation,
} from '../types';

interface GameState {
  // Grid
  cells: CellState[];
  gridCols: number;
  gridRows: number;

  // Current user
  me: UserState | null;

  // Social
  userCount: number;
  leaderboard: LeaderboardEntry[];

  // Animations (canvas pulls these each frame)
  animations: Map<number, CellAnimation>;

  // Optimistic updates pending server confirm
  pendingCells: Set<number>;

  // Toast notifications
  toasts: Toast[];

  // Cooldown end time (ms since epoch)
  cooldownUntil: number;

  // Connection status
  connected: boolean;

  // Hover state
  hoveredCellId: number | null;

  // Actions
  setGridState: (payload: {
    cells: CellState[];
    user: UserState;
    userCount: number;
    leaderboard: LeaderboardEntry[];
    gridCols: number;
    gridRows: number;
  }) => void;

  updateCell: (patch: Partial<CellState> & { id: number }) => void;
  setUserCount: (count: number) => void;
  setLeaderboard: (leaderboard: LeaderboardEntry[]) => void;
  addAnimation: (anim: CellAnimation) => void;
  removeAnimation: (cellId: number) => void;
  addPending: (cellId: number) => void;
  removePending: (cellId: number) => void;
  pushToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  setCooldownUntil: (ts: number) => void;
  setConnected: (v: boolean) => void;
  setHoveredCell: (id: number | null) => void;
  updateMe: (patch: Partial<UserState>) => void;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

let toastCounter = 0;

export const useGameStore = create<GameState>((set) => ({
  cells: [],
  gridCols: 40,
  gridRows: 30,
  me: null,
  userCount: 0,
  leaderboard: [],
  animations: new Map(),
  pendingCells: new Set(),
  toasts: [],
  cooldownUntil: 0,
  connected: false,
  hoveredCellId: null,

  setGridState: (payload) =>
    set({
      cells: payload.cells,
      me: payload.user,
      userCount: payload.userCount,
      leaderboard: payload.leaderboard,
      gridCols: payload.gridCols,
      gridRows: payload.gridRows,
    }),

  updateCell: (patch) =>
    set((state) => {
      const next = [...state.cells];
      const existing = next[patch.id];
      if (existing) {
        next[patch.id] = { ...existing, ...patch };
      }
      return { cells: next };
    }),

  setUserCount: (count) => set({ userCount: count }),

  setLeaderboard: (leaderboard) => set({ leaderboard }),

  addAnimation: (anim) =>
    set((state) => {
      const next = new Map(state.animations);
      next.set(anim.cellId, anim);
      return { animations: next };
    }),

  removeAnimation: (cellId) =>
    set((state) => {
      const next = new Map(state.animations);
      next.delete(cellId);
      return { animations: next };
    }),

  addPending: (cellId) =>
    set((state) => {
      const next = new Set(state.pendingCells);
      next.add(cellId);
      return { pendingCells: next };
    }),

  removePending: (cellId) =>
    set((state) => {
      const next = new Set(state.pendingCells);
      next.delete(cellId);
      return { pendingCells: next };
    }),

  pushToast: (toast) => {
    const id = String(++toastCounter);
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));
    // Auto-remove after 3s
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },

  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  setCooldownUntil: (ts) => set({ cooldownUntil: ts }),

  setConnected: (v) => set({ connected: v }),

  setHoveredCell: (id) => set({ hoveredCellId: id }),

  updateMe: (patch) =>
    set((state) => ({
      me: state.me ? { ...state.me, ...patch } : state.me,
    })),
}));
