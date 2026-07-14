/**
 * Canvas-rendered grid with pan, zoom, hover tooltip, and animations.
 *
 * Architecture:
 *  - One <canvas> element fills the viewport
 *  - requestAnimationFrame loop renders every frame
 *  - All state is read from the Zustand store (shallow-equal selector)
 *  - Click/hover/wheel events update viewport transform + dispatch claims
 */

import React, {
  useRef,
  useEffect,
  useCallback,
} from 'react';
import { useGameStore } from '../store/gameStore';
import type { CellState } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────
const CELL_SIZE     = 28;   // logical pixels per cell at zoom=1
const BORDER        = 1;    // border width
const MIN_ZOOM      = 0.3;
const MAX_ZOOM      = 4.0;
const EMPTY_COLOR   = '#1e2433';
const BORDER_COLOR  = '#2d3553';
const HOVER_BORDER  = '#ffffff';
const PENDING_ALPHA = 0.5;

// ── Types ─────────────────────────────────────────────────────────────────────
interface Viewport {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

interface Props {
  onClaim: (cellId: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const GridCanvas: React.FC<Props> = ({ onClaim }) => {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const vpRef      = useRef<Viewport>({ offsetX: 0, offsetY: 0, zoom: 1 });
  const rafRef     = useRef<number>(0);
  const isDragging = useRef(false);
  const dragStart  = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const didDrag    = useRef(false);

  // Read stable refs to avoid re-subscribing on every frame
  const storeRef = useRef(useGameStore.getState());
  useEffect(() =>
    useGameStore.subscribe((s) => { storeRef.current = s; }),
  []);

  // ── Coordinate helpers ──────────────────────────────────────────────────────
  const canvasToCell = useCallback(
    (cx: number, cy: number): number | null => {
      const { offsetX, offsetY, zoom } = vpRef.current;
      const { gridCols, gridRows } = storeRef.current;
      const lx = (cx - offsetX) / zoom;
      const ly = (cy - offsetY) / zoom;
      const col = Math.floor(lx / CELL_SIZE);
      const row = Math.floor(ly / CELL_SIZE);
      if (col < 0 || col >= gridCols || row < 0 || row >= gridRows) return null;
      return row * gridCols + col;
    },
    []
  );

  const clampViewport = useCallback((vp: Viewport, cw: number, ch: number) => {
    const { gridCols, gridRows } = storeRef.current;
    const gridW = gridCols * CELL_SIZE * vp.zoom;
    const gridH = gridRows * CELL_SIZE * vp.zoom;
    // Allow panning so the grid always partially fills the canvas
    const padX = Math.max(cw * 0.3, 60);
    const padY = Math.max(ch * 0.3, 60);
    vp.offsetX = Math.min(padX, Math.max(vp.offsetX, cw - gridW - padX));
    vp.offsetY = Math.min(padY, Math.max(vp.offsetY, ch - gridH - padY));
  }, []);

  // ── Centre grid on first load ───────────────────────────────────────────────
  const centreGrid = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { gridCols, gridRows } = storeRef.current;
    const gridW = gridCols * CELL_SIZE;
    const gridH = gridRows * CELL_SIZE;
    vpRef.current.offsetX = (canvas.width  - gridW) / 2;
    vpRef.current.offsetY = (canvas.height - gridH) / 2;
  }, []);

  // ── Render loop ─────────────────────────────────────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { cells, gridCols, gridRows, animations, pendingCells, hoveredCellId, me } =
      storeRef.current;
    const { offsetX, offsetY, zoom } = vpRef.current;
    const now = performance.now();

    // Clear
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom, zoom);

    // Visible cell range (culling)
    const visX1 = Math.max(0, Math.floor(-offsetX / zoom / CELL_SIZE));
    const visY1 = Math.max(0, Math.floor(-offsetY / zoom / CELL_SIZE));
    const visX2 = Math.min(gridCols - 1, Math.ceil((canvas.width  - offsetX) / zoom / CELL_SIZE));
    const visY2 = Math.min(gridRows - 1, Math.ceil((canvas.height - offsetY) / zoom / CELL_SIZE));

    for (let row = visY1; row <= visY2; row++) {
      for (let col = visX1; col <= visX2; col++) {
        const cellId = row * gridCols + col;
        const cell: CellState = cells[cellId] ?? {
          id: cellId, ownerId: null, color: null, claimedAt: null, version: 0,
        };

        const x = col * CELL_SIZE + BORDER;
        const y = row * CELL_SIZE + BORDER;
        const w = CELL_SIZE - BORDER * 2;
        const h = CELL_SIZE - BORDER * 2;

        // ── Base fill ────────────────────────────────────────────────────────
        const isPending = pendingCells.has(cellId);
        const anim      = animations.get(cellId);

        let fillColor = cell.color ?? EMPTY_COLOR;
        let alpha     = 1;

        if (isPending && me) {
          fillColor = me.color;
          alpha     = PENDING_ALPHA;
        }

        // ── Animation ────────────────────────────────────────────────────────
        let scale = 1;
        if (anim) {
          const progress = Math.min(1, (now - anim.startTime) / anim.duration);
          const ease     = easeOutElastic(progress);

          if (anim.type === 'claim') {
            // Pulse: expand then settle
            scale = 1 + 0.3 * Math.sin(progress * Math.PI);
          } else if (anim.type === 'reject') {
            // Shake: red flash
            fillColor = '#ef4444';
            alpha = 1 - progress * 0.5;
          } else if (anim.type === 'optimistic') {
            scale = 0.85 + 0.15 * ease;
          }

          if (progress >= 1) {
            // Schedule cleanup without mutating mid-render
            setTimeout(() => useGameStore.getState().removeAnimation(cellId), 0);
          }
        }

        // ── Draw cell ────────────────────────────────────────────────────────
        ctx.save();
        ctx.globalAlpha = alpha;

        if (scale !== 1) {
          ctx.translate(x + w / 2, y + h / 2);
          ctx.scale(scale, scale);
          ctx.translate(-(x + w / 2), -(y + h / 2));
        }

        // Shadow for owned cells
        if (cell.ownerId) {
          ctx.shadowColor = fillColor;
          ctx.shadowBlur  = zoom > 1 ? 6 : 3;
        }

        ctx.fillStyle = fillColor;
        roundRect(ctx, x, y, w, h, 3 * zoom > 2 ? 3 : 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // ── Border ───────────────────────────────────────────────────────────
        const isHovered = hoveredCellId === cellId;
        const isOwn     = me && cell.ownerId === me.id;

        if (isHovered) {
          ctx.strokeStyle = HOVER_BORDER;
          ctx.lineWidth   = 1.5 / zoom;
          ctx.stroke();
        } else if (isOwn && zoom > 0.6) {
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth   = 1 / zoom;
          ctx.stroke();
        } else if (zoom > 0.8) {
          ctx.strokeStyle = BORDER_COLOR;
          ctx.lineWidth   = 0.5 / zoom;
          ctx.stroke();
        }

        ctx.restore();
      }
    }

    ctx.restore();

    rafRef.current = requestAnimationFrame(render);
  }, []);

  // ── Resize handler ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onResize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    onResize();
    window.addEventListener('resize', onResize);

    // Wait for grid data before centring
    const unsub = useGameStore.subscribe((s) => {
      if (s.gridCols > 0) {
        centreGrid();
        unsub();
      }
    });

    rafRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafRef.current);
      unsub();
    };
  }, [render, centreGrid]);

  // ── Pointer events ──────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    didDrag.current    = false;
    dragStart.current  = {
      x: e.clientX,
      y: e.clientY,
      ox: vpRef.current.offsetX,
      oy: vpRef.current.offsetY,
    };
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDragging.current) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
      const canvas = canvasRef.current;
      vpRef.current.offsetX = dragStart.current.ox + dx;
      vpRef.current.offsetY = dragStart.current.oy + dy;
      if (canvas) clampViewport(vpRef.current, canvas.width, canvas.height);
    } else {
      const cellId = canvasToCell(e.clientX, e.clientY);
      useGameStore.getState().setHoveredCell(cellId);
    }
  }, [canvasToCell, clampViewport]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;

    if (!didDrag.current) {
      const cellId = canvasToCell(e.clientX, e.clientY);
      if (cellId !== null) onClaim(cellId);
    }
  }, [canvasToCell, onClaim]);

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vpRef.current.zoom * factor));
    const ratio = newZoom / vpRef.current.zoom;

    // Zoom towards cursor
    vpRef.current.offsetX = e.clientX - ratio * (e.clientX - vpRef.current.offsetX);
    vpRef.current.offsetY = e.clientY - ratio * (e.clientY - vpRef.current.offsetY);
    vpRef.current.zoom    = newZoom;
    clampViewport(vpRef.current, canvas.width, canvas.height);
  }, [clampViewport]);

  const onMouseLeave = useCallback(() => {
    useGameStore.getState().setHoveredCell(null);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 cursor-crosshair touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
      onMouseLeave={onMouseLeave}
    />
  );
};

// ── Canvas helpers ─────────────────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number
): void {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  // Fallback for Safari
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function easeOutElastic(t: number): number {
  if (t === 0 || t === 1) return t;
  const p = 0.4;
  return Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1;
}

export default GridCanvas;
