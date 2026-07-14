/**
 * In-memory grid cache — single source of truth for live state.
 * All reads happen here (O(1)).  Writes go through here AND flush to Postgres.
 *
 * This is intentionally single-instance scoped.  For horizontal scaling,
 * replace this with a Redis hash (HSET / HGET) and add the Socket.IO
 * Redis adapter so broadcasts fan out across pods.
 */

import { CellState, UserState } from '../types';
import { config, GRID_SIZE } from '../config/env';
import { logger } from '../utils/logger';

export class GridCache {
  private cells: CellState[];
  private users: Map<string, UserState>;

  constructor() {
    this.cells = [];
    this.users = new Map();
    this.initCells();
  }

  // ── Initialization ─────────────────────────────────────────────────────────

  private initCells(): void {
    this.cells = Array.from({ length: GRID_SIZE }, (_, i) => ({
      id: i,
      ownerId: null,
      color: null,
      claimedAt: null,
      version: 0,
    }));
  }

  /** Hydrate from DB rows after startup */
  loadCells(rows: CellState[]): void {
    for (const row of rows) {
      if (row.id >= 0 && row.id < GRID_SIZE) {
        this.cells[row.id] = row;
      }
    }
    logger.info(`GridCache: loaded ${rows.length} cells`);
  }

  loadUsers(users: UserState[]): void {
    for (const u of users) {
      this.users.set(u.id, u);
    }
    logger.info(`GridCache: loaded ${users.length} users`);
  }

  // ── Cell reads ─────────────────────────────────────────────────────────────

  getCell(cellId: number): CellState | null {
    if (cellId < 0 || cellId >= GRID_SIZE) return null;
    return this.cells[cellId] ?? null;
  }

  getAllCells(): CellState[] {
    return this.cells;
  }

  isValidCellId(cellId: number): boolean {
    return Number.isInteger(cellId) && cellId >= 0 && cellId < GRID_SIZE;
  }

  // ── Cell writes ────────────────────────────────────────────────────────────

  updateCell(patch: CellState): void {
    if (!this.isValidCellId(patch.id)) return;
    this.cells[patch.id] = patch;
  }

  // ── User reads/writes ──────────────────────────────────────────────────────

  getUser(userId: string): UserState | null {
    return this.users.get(userId) ?? null;
  }

  setUser(user: UserState): void {
    this.users.set(user.id, user);
  }

  getAllUsers(): UserState[] {
    return Array.from(this.users.values());
  }

  incrementUserCells(userId: string): void {
    const u = this.users.get(userId);
    if (u) u.cellsOwned += 1;
  }

  decrementUserCells(userId: string): void {
    const u = this.users.get(userId);
    if (u && u.cellsOwned > 0) u.cellsOwned -= 1;
  }

  // ── Leaderboard ────────────────────────────────────────────────────────────

  getLeaderboard(topN: number) {
    return Array.from(this.users.values())
      .sort((a, b) => b.cellsOwned - a.cellsOwned)
      .slice(0, topN)
      .map((u) => ({
        userId: u.id,
        displayName: u.displayName,
        color: u.color,
        cellsOwned: u.cellsOwned,
      }));
  }

  get gridConfig() {
    return { cols: config.gridCols, rows: config.gridRows };
  }
}

// Singleton
export const gridCache = new GridCache();
