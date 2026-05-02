import { BOARD_H, BUFFER_H, COLORS } from '../game/constants';
import { blocksOf } from '../game/pieces';
import type { GameState, Piece, PieceType } from '../game/types';
import { getGhost } from '../game/engine';

function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, ghost = false) {
  const px = x * size;
  const py = y * size;
  if (ghost) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = color;
    ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);
    ctx.restore();
    return;
  }
  // gradient body
  const grad = ctx.createLinearGradient(px, py, px, py + size);
  grad.addColorStop(0, lighten(color, 0.3));
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, darken(color, 0.25));
  ctx.fillStyle = grad;
  ctx.fillRect(px, py, size, size);
  // bevel
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(px, py, size, 2);
  ctx.fillRect(px, py, 2, size);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(px, py + size - 2, size, 2);
  ctx.fillRect(px + size - 2, py, 2, size);
  // outline
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
}

function lighten(hex: string, amt: number): string { return mix(hex, '#ffffff', amt); }
function darken(hex: string, amt: number): string { return mix(hex, '#000000', amt); }
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
}
function parseHex(s: string): [number, number, number] {
  if (s.startsWith('rgb')) {
    const m = s.match(/\d+/g)!.map(Number);
    return [m[0], m[1], m[2]];
  }
  const h = s.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, size: number) {
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let x = 1; x < w; x++) {
    ctx.beginPath();
    ctx.moveTo(x * size + 0.5, 0);
    ctx.lineTo(x * size + 0.5, h * size);
    ctx.stroke();
  }
  for (let y = 1; y < h; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * size + 0.5);
    ctx.lineTo(w * size, y * size + 0.5);
    ctx.stroke();
  }
}

function drawPiece(ctx: CanvasRenderingContext2D, p: Piece, size: number, ghost = false) {
  const color = COLORS[p.type];
  for (const [dx, dy] of blocksOf(p.type, p.rotation)) {
    const x = p.x + dx;
    const y = p.y + dy - BUFFER_H; // shift to visible coords
    if (y < 0) continue;
    drawBlock(ctx, x, y, size, color, ghost);
  }
}

export function renderBoard(canvas: HTMLCanvasElement, state: GameState): void {
  const boardWidth = state.boardWidth;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const size = Math.floor(Math.min(cssW / boardWidth, cssH / BOARD_H));
  const w = size * boardWidth;
  const h = size * BOARD_H;
  const ox = Math.floor((cssW - w) / 2);
  const oy = Math.floor((cssH - h) / 2);

  ctx.clearRect(0, 0, cssW, cssH);

  // playfield bg
  ctx.fillStyle = '#07091a';
  ctx.fillRect(ox, oy, w, h);

  ctx.save();
  ctx.translate(ox, oy);
  drawGrid(ctx, boardWidth, BOARD_H, size);

  // Settled blocks
  for (let y = BUFFER_H; y < state.board.length; y++) {
    for (let x = 0; x < boardWidth; x++) {
      const cell = state.board[y][x];
      if (cell !== 0) {
        drawBlock(ctx, x, y - BUFFER_H, size, COLORS[cell as PieceType]);
      }
    }
  }

  // Ghost piece
  const ghost = getGhost(state);
  if (ghost && state.current) {
    drawPiece(ctx, ghost, size, true);
    drawPiece(ctx, state.current, size, false);
  }

  // Line clear flash
  if (state.clearAnim) {
    const t = Math.min(1, state.clearAnim.t / 200);
    const alpha = 1 - t;
    ctx.fillStyle = `rgba(255,255,255,${alpha * 0.7})`;
    for (const row of state.clearAnim.rows) {
      const y = row - BUFFER_H;
      if (y >= 0) ctx.fillRect(0, y * size, w, size);
    }
  }

  ctx.restore();

  // Top fade for spawn area
  ctx.fillStyle = 'rgba(7, 9, 26, 0.7)';
  ctx.fillRect(ox, oy, w, 2);
}

// ────────── mini canvases (hold + next)

export function renderMini(canvas: HTMLCanvasElement, type: PieceType | null, dim = false): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  if (!type) return;

  // Compute bounding box of piece in spawn rotation, then center it.
  const blocks = blocksOf(type, 0);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of blocks) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const size = Math.floor(Math.min(cssW / (bw + 1), cssH / (bh + 1)));
  const ox = (cssW - bw * size) / 2 - minX * size;
  const oy = (cssH - bh * size) / 2 - minY * size;

  ctx.save();
  ctx.translate(ox, oy);
  if (dim) ctx.globalAlpha = 0.4;
  for (const [x, y] of blocks) {
    drawBlock(ctx, x, y, size, COLORS[type]);
  }
  ctx.restore();
}

export function renderQueue(canvas: HTMLCanvasElement, queue: PieceType[], count = 5): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const slotH = cssH / count;
  const size = Math.floor(Math.min(cssW / 5, slotH / 3));

  for (let i = 0; i < Math.min(count, queue.length); i++) {
    const type = queue[i];
    const blocks = blocksOf(type, 0);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of blocks) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const ox = (cssW - bw * size) / 2 - minX * size;
    const oy = i * slotH + (slotH - bh * size) / 2 - minY * size;

    ctx.save();
    ctx.translate(ox, oy);
    for (const [x, y] of blocks) {
      drawBlock(ctx, x, y, size, COLORS[type]);
    }
    ctx.restore();
  }
}
