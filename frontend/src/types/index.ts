// Mirror of backend types — keep in sync

export interface CellState {
  id: number;
  ownerId: string | null;
  color: string | null;
  claimedAt: string | null;
  version: number;
}

export interface UserState {
  id: string;
  displayName: string;
  color: string;
  cellsOwned: number;
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  color: string;
  cellsOwned: number;
}

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
  cooldownMs?: number;
}

export interface UserCountPayload {
  count: number;
}

export interface LeaderboardUpdatePayload {
  leaderboard: LeaderboardEntry[];
}

// Animation frame for canvas
export interface CellAnimation {
  cellId: number;
  startTime: number;    // performance.now()
  duration: number;     // ms
  type: 'claim' | 'reject' | 'optimistic';
  color: string;
}
