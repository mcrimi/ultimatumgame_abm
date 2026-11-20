// Canvas drawings for the live simulation: the ring of players and the record
// of every claim. Ink and paper colours are read from CSS at draw time, so
// the drawings follow the reader's choice of paper.

function palette() {
  const css = getComputedStyle(document.documentElement);
  const get = (name) => css.getPropertyValue(name).trim();
  return { ink: get("--ink"), ink2: get("--ink-2"), line: get("--line"), paper: get("--paper"), sans: get("--sans") };
}

function prepare(canvas, ratio) {
  const width = Math.max(240, Math.round(canvas.getBoundingClientRect().width || 480));
  const height = Math.round(width * ratio);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const c = palette();
  ctx.fillStyle = c.paper;
  ctx.fillRect(0, 0, width, height);
  return { ctx, width, height, c };
}

function cross(ctx, x, y, size) {
  ctx.beginPath();
  ctx.moveTo(x - size, y - size);
  ctx.lineTo(x + size, y + size);
  ctx.moveTo(x - size, y + size);
  ctx.lineTo(x + size, y - size);
  ctx.stroke();
}

/**
 * Players sit at fixed places on a ring. Each is a square whose side grows
 * with their share of all wealth; a broke player is an empty square. Lines
 * join the pairs that played this turn.
 */
export function drawRing(canvas, pop, turn, params) {
  const { ctx, width, height, c } = prepare(canvas, 1);
  const n = pop.wealth.length;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 22;
  const at = (i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
  };
  let total = 0;
  for (let i = 0; i < n; i += 1) total += pop.wealth[i];
  const mean = total / n || 1;

  if (turn) {
    turn.outcome.forEach((outcome, k) => {
      if (outcome === "idle") return;
      const [x1, y1] = at(turn.proposer[k]);
      const [x2, y2] = at(turn.responder[k]);
      ctx.strokeStyle = outcome === "accepted" ? c.ink2 : c.ink;
      ctx.lineWidth = outcome === "accepted" ? 0.6 : 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });
  }

  for (let i = 0; i < n; i += 1) {
    const [x, y] = at(i);
    const broke = pop.wealth[i] < Math.max(params.cost_to_play, Number.MIN_VALUE);
    // Side grows with the square root of relative wealth, within sensible bounds.
    const side = broke ? 7 : Math.max(5, Math.min(22, 9 * Math.sqrt(pop.wealth[i] / mean)));
    ctx.fillStyle = broke ? c.paper : c.ink;
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1;
    ctx.fillRect(Math.round(x - side / 2), Math.round(y - side / 2), Math.round(side), Math.round(side));
    ctx.strokeRect(Math.round(x - side / 2) + 0.5, Math.round(y - side / 2) + 0.5, Math.round(side) - 1, Math.round(side) - 1);
  }

  if (turn) {
    ctx.strokeStyle = c.paper;
    turn.outcome.forEach((outcome, k) => {
      if (outcome !== "rejected") return;
      const [x, y] = at(turn.responder[k]);
      ctx.lineWidth = 5;
      ctx.strokeStyle = c.paper;
      cross(ctx, x, y, 7);
      ctx.lineWidth = 2;
      ctx.strokeStyle = c.ink;
      cross(ctx, x, y, 7);
    });
  }
}

/**
 * Every claim so far. x: turn, y: take rate claimed. Accepted claims are
 * dots, rejected ones crosses. `log` is a flat list of [turn, claim, rejected].
 */
export function drawClaims(canvas, log, turnsShown, params) {
  const { ctx, width, height, c } = prepare(canvas, 0.79);
  const m = { top: 12, right: 14, bottom: 34, left: 40 };
  const sx = (t) => m.left + (t / turnsShown) * (width - m.left - m.right);
  const sy = (v) => height - m.bottom - v * (height - m.top - m.bottom);

  ctx.font = `11px ${c.sans}`;
  ctx.fillStyle = c.ink2;
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 1;
  ctx.textAlign = "right";
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    const y = Math.round(sy(v)) + 0.5;
    if (v > 0) { ctx.beginPath(); ctx.moveTo(m.left, y); ctx.lineTo(width - m.right, y); ctx.stroke(); }
    ctx.fillText(`${v * 100}%`, m.left - 6, y + 4);
  }
  ctx.textAlign = "center";
  const stepX = turnsShown <= 100 ? 20 : turnsShown <= 300 ? 50 : 100;
  for (let t = 0; t <= turnsShown; t += stepX) ctx.fillText(String(t), sx(t), height - m.bottom + 16);
  ctx.textAlign = "left";
  ctx.fillText("Turn", m.left, height - 4);

  ctx.strokeStyle = c.ink;
  ctx.beginPath();
  ctx.moveTo(m.left + 0.5, m.top);
  ctx.lineTo(m.left + 0.5, height - m.bottom + 0.5);
  ctx.lineTo(width - m.right, height - m.bottom + 0.5);
  ctx.stroke();

  // What responders tolerate on average.
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(m.left, Math.round(sy(params.tolerance_mean)) + 0.5);
  ctx.lineTo(width - m.right, Math.round(sy(params.tolerance_mean)) + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);

  const dot = turnsShown > 200 ? 1.5 : 2;
  ctx.fillStyle = c.ink;
  for (let i = 0; i < log.length; i += 3) {
    if (log[i + 2]) continue;
    ctx.fillRect(Math.round(sx(log[i]) - dot / 2), Math.round(sy(log[i + 1]) - dot / 2), dot, dot);
  }
  ctx.lineWidth = 1.5;
  for (let i = 0; i < log.length; i += 3) {
    if (!log[i + 2]) continue;
    cross(ctx, sx(log[i]), sy(log[i + 1]), 3.5);
  }
}
