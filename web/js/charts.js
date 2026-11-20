// Ink-only SVG charts for the findings. Colours come from CSS variables, so
// the same drawing works on Warm, Grey and Night paper.

export const DASHES = ["", "7 3", "1.5 3.5", "9 3 1.5 3", "4 3"];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const r = (n) => Math.round(n * 10) / 10;

export function linearScale([d0, d1], [r0, r1]) {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

/** Polyline through the points, skipping gaps (null or NaN). */
export function linePath(xs, ys, sx, sy) {
  let d = "";
  let pen = false;
  for (let i = 0; i < xs.length; i += 1) {
    const y = ys[i];
    if (y === null || y === undefined || Number.isNaN(y)) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${r(sx(xs[i]))},${r(sy(y))}`;
    pen = true;
  }
  return d;
}

export function areaPath(xs, lo, hi, sx, sy) {
  const idx = xs.map((_, i) => i).filter((i) => Number.isFinite(lo[i]) && Number.isFinite(hi[i]));
  if (!idx.length) return "";
  const top = idx.map((i) => `${r(sx(xs[i]))},${r(sy(hi[i]))}`);
  const bottom = idx.reverse().map((i) => `${r(sx(xs[i]))},${r(sy(lo[i]))}`);
  return `M${top.join("L")}L${bottom.join("L")}Z`;
}

/** Spread label positions so they do not overlap; keeps their order. */
export function spreadLabels(ys, gap, min, max) {
  const order = ys.map((y, i) => [y, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(ys.length);
  let prev = -Infinity;
  for (const [y, i] of order) {
    out[i] = Math.max(y, prev + gap, min);
    prev = out[i];
  }
  let ceiling = max;
  for (let k = order.length - 1; k >= 0; k -= 1) {
    const i = order[k][1];
    out[i] = Math.min(out[i], ceiling);
    ceiling = out[i] - gap;
  }
  return out;
}

export function ticks(min, max, count = 5) {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count + 0.5) || raw;
  const out = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(Math.round(v * 1e9) / 1e9 + 0); // + 0 turns -0 into 0
  return out;
}

const hatch = `<defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="hatch-line" x1="0" y1="0" x2="0" y2="5"/></pattern></defs>`;

/**
 * A line chart with labels at the right-hand end of each series.
 * series: [{ label, x, y, dash, lo, hi }]   lo/hi draw a hatched band
 * points: [{ x, y, open }]                  square markers
 */
export function drawLines(svg, { x, y, series, points = [], xLabel = "", yFormat = (v) => v, xFormat = (v) => v, labelWidth = 120, ratio = 0.5 }) {
  const box = svg.getBoundingClientRect().width || svg.parentNode.clientWidth || 640;
  const width = Math.max(280, Math.round(box));
  const narrow = width < 480;
  const height = Math.max(230, Math.round(width * (narrow ? Math.max(ratio, 0.68) : ratio)));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const m = { top: 10, right: narrow ? Math.min(labelWidth, 92) : labelWidth, bottom: 38, left: 42 };
  const sx = linearScale(x, [m.left, width - m.right]);
  const sy = linearScale(y, [height - m.bottom, m.top]);
  let out = hatch;

  for (const t of ticks(y[0], y[1], 4)) {
    if (t > y[0]) out += `<line class="grid" x1="${m.left}" x2="${r(sx(x[1]))}" y1="${r(sy(t))}" y2="${r(sy(t))}"/>`;
    out += `<text x="${m.left - 7}" y="${r(sy(t)) + 4}" text-anchor="end">${esc(yFormat(t))}</text>`;
  }
  for (const t of ticks(x[0], x[1], narrow ? 4 : 8)) {
    out += `<line class="axis" x1="${r(sx(t))}" x2="${r(sx(t))}" y1="${height - m.bottom}" y2="${height - m.bottom + 4}"/>`;
    out += `<text x="${r(sx(t))}" y="${height - m.bottom + 16}" text-anchor="middle">${esc(xFormat(t))}</text>`;
  }
  out += `<text x="${m.left}" y="${height - 4}">${esc(xLabel)}</text>`;
  out += `<path class="axis" d="M${m.left},${m.top}V${height - m.bottom}H${r(sx(x[1]))}"/>`;

  for (const s of series) if (s.lo && s.hi) out += `<path class="band" d="${areaPath(s.x, s.lo, s.hi, sx, sy)}"/>`;

  const lastY = (s) => { for (let i = s.y.length - 1; i >= 0; i -= 1) if (Number.isFinite(s.y[i])) return s.y[i]; return y[0]; };
  const ends = series.map((s) => sy(Math.min(Math.max(lastY(s), y[0]), y[1])));
  const ys = spreadLabels(ends, 13, m.top + 4, height - m.bottom - 2);
  series.forEach((s, i) => {
    out += `<path class="line" d="${linePath(s.x, s.y, sx, sy)}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}/>`;
    if (s.label) {
      if (Math.abs(ys[i] - ends[i]) > 2) out += `<path class="grid" d="M${r(sx(x[1]) + 1)},${r(ends[i])}L${r(sx(x[1]) + 6)},${r(ys[i])}"/>`;
      out += `<text class="lbl" x="${r(sx(x[1]) + 9)}" y="${r(ys[i] + 4)}">${esc(s.label)}</text>`;
    }
  });
  for (const p of points) {
    out += `<rect class="pt${p.open ? " open" : ""}" x="${r(sx(p.x) - 3)}" y="${r(sy(p.y) - 3)}" width="6" height="6"/>`;
  }
  svg.innerHTML = out;
}
