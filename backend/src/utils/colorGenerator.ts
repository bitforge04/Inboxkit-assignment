/**
 * Deterministically assign a visually-distinct, accessible color to a user.
 * Uses a golden-ratio hue distribution so consecutive users never get
 * similar colors.  Saturation + lightness are fixed for accessibility.
 */

const GOLDEN_RATIO = 0.6180339887;
const SATURATION = 70;   // %
const LIGHTNESS  = 55;   // % — bright enough to read white text on top

/** Map a userId string to a stable [0,1) value via simple hash */
function hashToFloat(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return (hash >>> 0) / 0xffffffff;
}

export function userColor(userId: string): string {
  const hue = ((hashToFloat(userId) + GOLDEN_RATIO) % 1) * 360;
  return `hsl(${hue.toFixed(1)},${SATURATION}%,${LIGHTNESS}%)`;
}

/** Convert HSL string to hex for Canvas rendering */
export function hslToHex(hsl: string): string {
  const match = hsl.match(/hsl\(([^,]+),([^,]+)%,([^)]+)%\)/);
  if (!match) return '#888888';

  const h = parseFloat(match[1]) / 360;
  const s = parseFloat(match[2]) / 100;
  const l = parseFloat(match[3]) / 100;

  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
