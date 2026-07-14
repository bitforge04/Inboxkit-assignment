/**
 * Right-side panel: user identity, stats, leaderboard, connection status.
 */

import React, { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';

export const Sidebar: React.FC = () => {
  const me          = useGameStore((s) => s.me);
  const userCount   = useGameStore((s) => s.userCount);
  const leaderboard = useGameStore((s) => s.leaderboard);
  const connected   = useGameStore((s) => s.connected);
  const cooldownUntil = useGameStore((s) => s.cooldownUntil);
  const gridCols    = useGameStore((s) => s.gridCols);
  const gridRows    = useGameStore((s) => s.gridRows);

  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, cooldownUntil - Date.now());
      setCooldownLeft(remaining);
    }, 50);
    return () => clearInterval(interval);
  }, [cooldownUntil]);

  const totalCells = gridCols * gridRows;
  const myCells    = me?.cellsOwned ?? 0;
  const myPct      = totalCells > 0 ? ((myCells / totalCells) * 100).toFixed(1) : '0';

  return (
    <>
      {/* Toggle button (mobile) */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="fixed top-4 right-4 z-40 md:hidden bg-gray-800 border border-gray-700 rounded-lg p-2 text-gray-300 hover:text-white transition-colors"
      >
        {isOpen ? '✕' : '☰'}
      </button>

      <aside
        className={`
          fixed right-0 top-0 h-full z-30 w-72 bg-gray-900/95 backdrop-blur-md
          border-l border-gray-800 flex flex-col transition-transform duration-300
          ${isOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
        `}
      >
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <h1 className="text-white font-bold text-lg tracking-tight">
              🟦 Grid Wars
            </h1>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`}
              />
              <span className="text-xs text-gray-400">
                {connected ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
          <p className="text-gray-500 text-xs mt-1">
            {userCount} {userCount === 1 ? 'player' : 'players'} online
          </p>
        </div>

        {/* My identity */}
        {me && (
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-medium">
              You
            </p>
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex-shrink-0 shadow-lg"
                style={{ backgroundColor: me.color }}
              />
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold truncate">
                  {me.displayName}
                </p>
                <p className="text-gray-400 text-xs">
                  {myCells} cells · {myPct}% of grid
                </p>
              </div>
            </div>

            {/* Cooldown bar */}
            {cooldownLeft > 0 && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Cooldown</span>
                  <span>{(cooldownLeft / 1000).toFixed(1)}s</span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (cooldownLeft / 5000) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Leaderboard */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 font-medium">
            🏆 Leaderboard
          </p>
          {leaderboard.length === 0 ? (
            <p className="text-gray-600 text-sm">No claims yet — be first!</p>
          ) : (
            <ol className="space-y-2">
              {leaderboard.map((entry, i) => {
                const isMe = me?.id === entry.userId;
                const pct  = totalCells > 0
                  ? ((entry.cellsOwned / totalCells) * 100).toFixed(1)
                  : '0';

                return (
                  <li
                    key={entry.userId}
                    className={`
                      flex items-center gap-2.5 px-2 py-2 rounded-lg transition-colors
                      ${isMe ? 'bg-blue-900/30 border border-blue-700/40' : 'bg-gray-800/50'}
                    `}
                  >
                    <span className="text-gray-500 text-xs font-mono w-4 text-right flex-shrink-0">
                      {i + 1}
                    </span>
                    <div
                      className="w-5 h-5 rounded flex-shrink-0"
                      style={{ backgroundColor: entry.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${isMe ? 'text-blue-300 font-semibold' : 'text-gray-200'}`}>
                        {entry.displayName}
                        {isMe && <span className="text-xs text-blue-400 ml-1">(you)</span>}
                      </p>
                      <div className="mt-0.5">
                        <div className="h-1 bg-gray-700 rounded-full">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: entry.color,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 font-mono flex-shrink-0">
                      {entry.cellsOwned}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Grid stats footer */}
        <div className="px-4 py-3 border-t border-gray-800">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-800/60 rounded-lg p-2">
              <p className="text-gray-500">Grid size</p>
              <p className="text-white font-mono">{gridCols}×{gridRows}</p>
            </div>
            <div className="bg-gray-800/60 rounded-lg p-2">
              <p className="text-gray-500">Total cells</p>
              <p className="text-white font-mono">{totalCells.toLocaleString()}</p>
            </div>
          </div>
          <p className="text-gray-600 text-[10px] mt-2 text-center">
            Scroll to zoom · Drag to pan · Click to claim
          </p>
        </div>
      </aside>
    </>
  );
};
