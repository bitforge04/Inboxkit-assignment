/**
 * Floating tooltip that appears when hovering a cell.
 * Reads hovered cell from store and positions itself with pointer events: none.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';

export const HoverTooltip: React.FC = () => {
  const hoveredId = useGameStore((s) => s.hoveredCellId);
  const cells     = useGameStore((s) => s.cells);
  const gridCols  = useGameStore((s) => s.gridCols);

  const [pos, setPos] = useState({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setPos({ x: e.clientX + 16, y: e.clientY + 16 });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  if (hoveredId === null) return null;

  const cell = cells[hoveredId];
  if (!cell) return null;

  const row = Math.floor(hoveredId / gridCols);
  const col = hoveredId % gridCols;

  const claimedAt = cell.claimedAt
    ? new Date(cell.claimedAt).toLocaleString()
    : null;

  // Keep tooltip on screen
  const tx = Math.min(pos.x, window.innerWidth  - 220);
  const ty = Math.min(pos.y, window.innerHeight - 120);

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50 pointer-events-none"
      style={{ left: tx, top: ty }}
    >
      <div className="bg-gray-900/95 border border-gray-700 rounded-lg px-3 py-2 shadow-xl text-xs min-w-[160px]">
        <div className="flex items-center gap-2 mb-1">
          {cell.color ? (
            <span
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: cell.color }}
            />
          ) : (
            <span className="w-3 h-3 rounded-sm bg-gray-600 flex-shrink-0" />
          )}
          <span className="font-semibold text-white">
            {cell.ownerId ? 'Claimed' : 'Unclaimed'}
          </span>
        </div>
        <div className="text-gray-400 space-y-0.5">
          <div>Cell ({col}, {row})</div>
          {claimedAt && <div className="truncate">📅 {claimedAt}</div>}
          <div className="text-gray-500">v{cell.version}</div>
        </div>
      </div>
    </div>
  );
};
