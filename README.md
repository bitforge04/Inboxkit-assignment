# Grid Wars — Real-time Multiplayer Cell Capture

A shared 40×30 grid (1,200 cells) where any connected user can claim any cell in real time. Every claim is instantly visible to all other players. Simultaneous claims on the same cell are handled correctly — one wins, the other gets an explicit rejection.

---

## Live Demo

- **Frontend:** https://inboxkit-assignment-production-f1ef.up.railway.app
- **Backend:** https://inboxkit-assignment-production.up.railway.app

---

## Quick Start

### Option A — Railway (deployed)

Backend and frontend run as separate Railway services with Postgres and Redis plugins.

Required backend environment variables:
```
DATABASE_URL=       # from Railway Postgres plugin
REDIS_URL=          # from Railway Redis plugin
NODE_ENV=production
PORT=4000
CORS_ORIGIN=        # your frontend Railway URL
CLAIM_COOLDOWN_MS=2000
STEAL_COOLDOWN_MS=5000
GRID_COLS=40
GRID_ROWS=30
LEADERBOARD_SIZE=5
```

Required frontend environment variable:
```
VITE_SOCKET_URL=    # your backend Railway URL
```

Set backend root directory to `/backend` and frontend root directory to `/frontend` in Railway service settings.

### Option B — Docker Compose (local)

```bash
docker-compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- Health: http://localhost:4000/api/health

> **Permission issues:** If you see `grid_user was denied access`, wipe the volume and rebuild:
> ```bash
> docker compose down -v && docker compose up --build
> ```
> To fix without losing data:
> ```bash
> docker compose exec postgres psql -U postgres -d grid_db -c \
>   "GRANT USAGE ON SCHEMA public TO grid_user; \
>    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO grid_user; \
>    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO grid_user;"
> docker compose restart backend
> ```

### Option C — Local dev (requires Postgres + Redis running)

```bash
# 1. Install deps
cd backend && npm install
cd ../frontend && npm install

# 2. Configure env
cp backend/.env.example backend/.env

# 3. Run backend
cd backend
npx prisma migrate dev --name init
npm run dev        # :4000

# 4. Run frontend
cd frontend
npm run dev        # :3000
```

---

## Architecture

```
Browser (React + Canvas)
        │
        │  WebSocket (Socket.IO)
        │  + HTTP /api/*
        ▼
   Node.js / Express / Socket.IO  (:4000)
        │              │
        │              └── Redis
        │                  • per-user cooldown TTL keys
        │                  • (pub/sub adapter when horizontally scaled)
        │
        └── PostgreSQL
            • cells table  (id, ownerId, color, claimedAt, version)
            • users table  (id, displayName, color, cellsOwned, lastClaimAt)
```

**In-memory grid cache** (`src/game/gridCache.ts`): all reads come from a plain JS array in the Node process — O(1), no DB hit per frame. Written through to Postgres on every claim. On startup the cache is hydrated from Postgres, so the board survives server restarts.

---

## Tech Stack Rationale

| Choice | Why |
|---|---|
| Node.js + TypeScript | Async I/O ideal for many concurrent WebSocket connections; TS catches protocol mismatches at compile time |
| Socket.IO | Built-in room broadcast, automatic fallback to long-polling, reconnect handling |
| PostgreSQL | Durable cell/user state; row-level `UPDATE … WHERE version = $v` gives optimistic locking without extra infrastructure |
| Redis | Sub-millisecond TTL keys for per-user cooldowns; drop-in pub/sub adapter for horizontal scaling |
| React + Vite | Fast HMR in dev; tree-shaking for a small prod bundle |
| HTML5 Canvas | 1,200 cells with animations at 60 fps — DOM nodes would create layout/paint pressure; Canvas skips all that |
| Zustand | Minimal React state; direct `getState()` reads in the RAF loop avoid React re-render overhead |

---

## Socket.IO Event Contract

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `join` | `{ token?: string }` | First message after connect. `token` is a previously issued userId stored in localStorage. Server assigns/reuses identity and replies with `grid_state`. |
| `claim_cell` | `{ cellId: number }` | Request to capture cell at index `cellId` (0-based, row-major). Server validates, processes, and either broadcasts `cell_updated` or sends `claim_rejected` back to caller. |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `grid_state` | Full snapshot: all cells, user identity, userCount, leaderboard, grid dimensions | Sent once on join and on reconnect — client has full state to render immediately. |
| `cell_updated` | `{ cellId, ownerId, color, claimedAt, version, displayName }` | Broadcast to **all** clients when a claim succeeds. |
| `claim_rejected` | `{ cellId, reason, cooldownMs? }` | Sent **only** to the requesting socket. Reason is one of: `cooldown`, `already_owned`, `invalid_cell`, `server_error`. `cooldownMs` carries remaining wait if reason is `cooldown`. |
| `user_count` | `{ count }` | Broadcast on connect/disconnect. |
| `leaderboard_update` | `{ leaderboard: LeaderboardEntry[] }` | Broadcast after every successful claim. |

---

## Conflict / Race-Condition Handling

Two users clicking the same cell within milliseconds is the core challenge. The solution is two-layered:

### Layer 1 — Per-cell in-memory mutex (`src/game/cellLock.ts`)

Each cell id maps to a Promise chain. Concurrent `claim_cell` events for the same cell are serialised: the second request doesn't start until the first has finished its DB write. This is O(1) memory per active cell and adds essentially zero latency overhead.

**Trade-off:** works correctly on a single server instance. For multi-instance deployments, replace with a Redis Redlock (`redlock` npm package) — one distributed lock per cell, ~1–2 ms overhead.

### Layer 2 — Optimistic DB version check (`src/game/claimEngine.ts`)

Even with the in-memory mutex, a failsafe exists:

```sql
UPDATE cells
SET "ownerId" = $userId, color = $color, "claimedAt" = $now, version = version + 1
WHERE id = $cellId AND version = $expectedVersion
```

If `rowsAffected === 0`, another write already incremented the version. The handler reloads the cell from DB, updates the cache, and retries (up to 3 times). This is the standard optimistic concurrency control (OCC) pattern and is safe across any number of concurrent writers.

**The losing request always gets `claim_rejected`** — the client never receives silence; it gets instant feedback ("Someone beat you to it!").

---

## Bonus Mechanics Implemented

- **Cooldown** — 2 s between fresh claims, 5 s after stealing. Enforced server-side with Redis TTL keys; the UI shows a draining progress bar and remaining seconds immediately on the first click — no need to wait for a server rejection to see it.
- **Steal mechanic** — any owned cell can be taken by another player, but costs the longer steal cooldown.
- **Live leaderboard** — top 5 by cells owned, updated after every successful claim.
- **Optimistic UI** — cell flashes your color immediately on click, reconciled or reverted when server responds.

---

## Horizontal Scaling

To run multiple backend instances behind a load balancer:

1. Add the Socket.IO Redis adapter:
   ```bash
   npm install @socket.io/redis-adapter
   ```
   ```ts
   import { createAdapter } from '@socket.io/redis-adapter';
   const pubClient = new Redis(config.redisUrl);
   const subClient = pubClient.duplicate();
   io.adapter(createAdapter(pubClient, subClient));
   ```
   Now `io.emit(...)` fan-outs via Redis pub/sub to all pods automatically.

2. Replace `CellLockManager` (in-memory) with a Redis Redlock distributed lock. Each cell gets a lock key `lock:cell:{id}` with a short TTL (e.g. 200 ms).

3. The in-memory `GridCache` becomes a Redis hash (`HGET/HSET grid:cells {cellId}`). Reads are still sub-millisecond.

4. On Render/Fly.io/Railway: deploy as a web service with `DATABASE_URL` and `REDIS_URL` set as environment secrets. Fly.io supports persistent Redis via Upstash; Railway has a first-class Redis addon.

---

## Load Testing

```bash
# 50 users, 30 seconds
node scripts/loadtest.js 50 30 http://localhost:4000

# 100 users, 60 seconds
node scripts/loadtest.js 100 60 http://localhost:4000
```

The script opens N Socket.IO connections, each sending `join` then randomly spamming `claim_cell` every 100–500 ms. Stats (connected count, claims/s, rejections, errors) print every 5 s. Expected: zero errors, many rejections (cooldowns), no state corruption.

---

## Known Limitations / Future Work

- **In-memory cell lock is single-instance only** — documented above; Redlock is the upgrade path.
- **GridCache is not shared across instances** — Redis hash would fix this.
- **No authentication** — session tokens are stored in localStorage; a determined user could forge another userId. For production, sign tokens with a server secret (JWT or HMAC).
- **No cell history** — could add an audit log table for replay/analytics.
- **Mobile pan/zoom** — pinch gesture is not yet wired; wheel zoom works on desktop.
- **Area-control bonus** — cluster detection is a nice future stat (flood-fill from each owned cell).
