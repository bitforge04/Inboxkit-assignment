import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(optional('PORT', '4000'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),

  databaseUrl: required('DATABASE_URL'),

  redisUrl: optional('REDIS_URL', 'redis://localhost:6379'),

  // Grid dimensions
  gridCols: parseInt(optional('GRID_COLS', '40'), 10),
  gridRows: parseInt(optional('GRID_ROWS', '30'), 10),

  // Cooldowns (ms)
  claimCooldownMs: parseInt(optional('CLAIM_COOLDOWN_MS', '2000'), 10),
  stealCooldownMs: parseInt(optional('STEAL_COOLDOWN_MS', '5000'), 10),

  // Leaderboard top-N
  leaderboardSize: parseInt(optional('LEADERBOARD_SIZE', '5'), 10),

  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:3000'),
} as const;

export const GRID_SIZE = config.gridCols * config.gridRows;
