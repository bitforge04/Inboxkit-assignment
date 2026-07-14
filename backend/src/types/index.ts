// ── Shared domain types ───────────────────────────────────────────────────────

export interface CellState {
  id: number;
  ownerId: string | null;
  color: string | null;
  claimedAt: string | null; // ISO string
  version: number;
}

export interface UserState {
  id: string;
  displayName: string;
  color: string;
  cellsOwned: number;
}

// ── Socket.IO event payloads ──────────────────────────────────────────────────

/** Client → Server */
export interface JoinPayload {
  token?: string; // existing userId stored in client localStorage
}

export interface ClaimCellPayload {
  cellId: number;
}

/** Server → Client */
export interface GridStatePayload {
  cells: CellState[];
  user: UserState;
  userCount: number;
  leaderboard: LeaderboardEntry[];
  gridCols: number;
  gridRows: number;
}

export interface CellUpdatedPayload {
  cellId: number;
  ownerId: string;
  color: string;
  claimedAt: string;
  version: number;
  displayName: string;
}

export interface ClaimRejectedPayload {
  cellId: number;
  reason: 'cooldown' | 'invalid_cell' | 'already_owned' | 'server_error';
  cooldownMs?: number; // remaining cooldown in ms if reason === 'cooldown'
}

export interface UserCountPayload {
  count: number;
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  color: string;
  cellsOwned: number;
}

export interface LeaderboardUpdatePayload {
  leaderboard: LeaderboardEntry[];
}

// ── Socket event names ────────────────────────────────────────────────────────
export const EVENTS = {
  // Client → Server
  JOIN: 'join',
  CLAIM_CELL: 'claim_cell',

  // Server → Client
  GRID_STATE: 'grid_state',
  CELL_UPDATED: 'cell_updated',
  CLAIM_REJECTED: 'claim_rejected',
  USER_COUNT: 'user_count',
  LEADERBOARD_UPDATE: 'leaderboard_update',
} as const;
