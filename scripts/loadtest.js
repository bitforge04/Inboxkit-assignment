#!/usr/bin/env node
/**
 * Load test: spawns N simulated users that each randomly claim cells.
 * 
 * Usage:
 *   node scripts/loadtest.js [users=50] [duration=30] [url=http://localhost:4000]
 * 
 * Requires: socket.io-client
 *   npm install socket.io-client
 */

const { io } = require('socket.io-client');

const USERS    = parseInt(process.argv[2] ?? '50',  10);
const DURATION = parseInt(process.argv[3] ?? '30',  10) * 1000; // ms
const URL      = process.argv[4] ?? 'http://localhost:4000';

const GRID_CELLS = 40 * 30; // must match server default

let totalClaims   = 0;
let totalRejected = 0;
let totalErrors   = 0;
const sockets     = [];

console.log(`\n🚀  Starting load test`);
console.log(`   Users:    ${USERS}`);
console.log(`   Duration: ${DURATION / 1000}s`);
console.log(`   Server:   ${URL}\n`);

for (let i = 0; i < USERS; i++) {
  const socket = io(URL, { transports: ['websocket'], reconnection: false });
  sockets.push(socket);

  let gridCols = 40;
  let gridRows = 30;
  let timer    = null;

  socket.on('connect', () => {
    socket.emit('join', {});
  });

  socket.on('grid_state', (payload) => {
    gridCols = payload.gridCols ?? 40;
    gridRows = payload.gridRows ?? 30;

    // Start claiming at random intervals (100-500ms)
    const claim = () => {
      const cellId = Math.floor(Math.random() * gridCols * gridRows);
      socket.emit('claim_cell', { cellId });
      totalClaims++;
      timer = setTimeout(claim, 100 + Math.random() * 400);
    };
    timer = setTimeout(claim, Math.random() * 500);
  });

  socket.on('cell_updated',   () => { /* success */ });
  socket.on('claim_rejected', () => { totalRejected++; });
  socket.on('error',          () => { totalErrors++; });
  socket.on('connect_error',  (e) => {
    console.error(`Socket ${i} connect error:`, e.message);
    totalErrors++;
  });
}

// Print stats every 5s
const statsInterval = setInterval(() => {
  const connected = sockets.filter((s) => s.connected).length;
  console.log(
    `  [${new Date().toLocaleTimeString()}]  ` +
    `Connected: ${connected}/${USERS}  ` +
    `Claims sent: ${totalClaims}  ` +
    `Rejected: ${totalRejected}  ` +
    `Errors: ${totalErrors}`
  );
}, 5000);

// Tear down after duration
setTimeout(() => {
  clearInterval(statsInterval);
  console.log(`\n✅  Test complete`);
  console.log(`   Total claims sent:  ${totalClaims}`);
  console.log(`   Total rejected:     ${totalRejected}`);
  console.log(`   Total errors:       ${totalErrors}`);
  console.log(`   Throughput:         ${(totalClaims / (DURATION / 1000)).toFixed(1)} claims/s\n`);
  sockets.forEach((s) => s.disconnect());
  process.exit(0);
}, DURATION);
