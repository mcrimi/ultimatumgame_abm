// Wiring for /ultimatum/: the live simulation and the findings charts.

import { DEFAULTS, initialPopulation, step, gini, validate } from "./engine.js";
import { equilibrium, rejectionRate } from "./theory.js";
import { drawRing, drawClaims } from "./view.js";
import { drawLines, DASHES } from "./charts.js";

const $ = (id) => document.getElementById(id);
const fill = (key, text) => document.querySelectorAll(`[data-fill="${key}"]`).forEach((el) => { el.textContent = text; });
const pct = (p, digits = 0) => (Number.isFinite(p) ? `${(100 * p).toFixed(digits)}%` : "–");

const MAX_TURNS = 400;
const BURN_IN = 20; // turns left out of the "long run" figures shown under the simulation

// restart: the setting shapes the starting population, so changing it starts a new world.
const SLIDERS = [
  { key: "shame", label: "Shame", min: 0, max: 0.95, step: 0.05, show: pct },
  { key: "greed", label: "Greed", min: 0, max: 0.5, step: 0.01, show: pct },
  { key: "take_mean", label: "Starting take rate", min: 0.1, max: 1, step: 0.05, show: pct, restart: true },
  { key: "tolerance_mean", label: "Responders tolerate", min: 0.1, max: 0.9, step: 0.05, show: pct, restart: true },
  { key: "turn_endowment", label: "Paid to all, per turn", min: 0, max: 5, step: 0.25, show: (v) => v.toFixed(2) },
  { key: "interest", label: "Interest", min: 0, max: 0.1, step: 0.01, show: pct },
];

const PRESETS = [
  { name: "2020 original", set: {} },
  { name: "Safety net", set: { turn_endowment: 1 } },
  { name: "Little shame", set: { shame: 0.1, turn_endowment: 1 } },
  { name: "Gentle start", set: { take_mean: 0.4, turn_endowment: 1 } },
];

const START_PRESET = 1; // the safety net keeps everyone playing, which shows the sawtooth best
const sim = { params: { ...DEFAULTS, ...PRESETS[START_PRESET].set }, seed: 1, turn: 0, pop: null, last: null, log: [], played: 0, rejected: 0, latePlayed: 0, lateRejected: 0, lateClaimed: 0, running: false, speed: 12, preset: START_PRESET };

/* ---------- Paper settings (shared with the main site) ---------- */

function initPaper(onChange) {
  const KEY = "mcrimi-site";
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } };
  const root = document.documentElement;
  const buttons = [...document.querySelectorAll("[data-paper]")];
  const show = (paper) => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.paper === paper)));
  show(read().paper || "warm");
  buttons.forEach((b) => b.addEventListener("click", () => {
    const paper = b.dataset.paper;
    root.dataset.theme = paper === "night" ? "dark" : "light";
    if (paper === "grey") root.dataset.paper = "grey"; else delete root.dataset.paper;
    try { localStorage.setItem(KEY, JSON.stringify({ ...read(), paper })); } catch (e) { /* private mode: keep it for this visit only */ }
    show(paper);
    onChange();
  }));
  const aa = $("aa");
  const panel = $("panel");
  const toggle = (open) => { panel.hidden = !open; aa.setAttribute("aria-expanded", String(open)); };
  aa.addEventListener("click", () => toggle(panel.hidden));
  document.addEventListener("click", (e) => { if (!panel.hidden && !panel.contains(e.target) && e.target !== aa) toggle(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") toggle(false); });
}

/* ---------- Simulation ---------- */

function newWorld(freshSeed = true) {
  if (freshSeed) sim.seed = (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
  validate(sim.params);
  Object.assign(sim, { turn: 0, last: null, log: [], played: 0, rejected: 0, latePlayed: 0, lateRejected: 0, lateClaimed: 0 });
  sim.pop = initialPopulation(sim.params, sim.seed);
  render();
}

function advance() {
  if (sim.turn >= MAX_TURNS) { setRunning(false); return; }
  const turn = step(sim.pop, sim.params, sim.seed, sim.turn);
  turn.outcome.forEach((outcome, k) => {
    if (outcome !== "idle") sim.log.push(sim.turn, turn.claim[k], outcome === "rejected" ? 1 : 0);
  });
  sim.played += turn.played;
  sim.rejected += turn.rejected;
  if (sim.turn >= BURN_IN) {
    sim.latePlayed += turn.played;
    sim.lateRejected += turn.rejected;
    sim.lateClaimed += turn.claimed;
  }
  sim.last = turn;
  sim.turn += 1;
}

function render() {
  const { params, pop, last } = sim;
  drawRing($("ring"), pop, last, params);
  drawClaims($("claims"), sim.log, Math.max(100, Math.ceil(sim.turn / 100) * 100), params);

  const broke = last ? last.broke : pop.wealth.filter((w) => w < Math.max(params.cost_to_play, Number.MIN_VALUE)).length;
  $("r-turn").textContent = sim.turn;
  $("r-rejected").textContent = sim.played ? pct(sim.rejected / sim.played, 1) : "–";
  $("r-broke").textContent = `${broke} of ${params.players}`;
  $("r-gini").textContent = gini(pop.wealth).toFixed(2);

  const eq = equilibrium(params);
  const predicted = Number.isFinite(eq.rejectionRate) ? pct(eq.rejectionRate, 1) : "no fixed share";
  let verdict;
  let fine = "";
  if (!sim.turn) {
    verdict = `The formula says <strong>${predicted}</strong> of claims will be rejected in the long run. Press Run and see.`;
  } else if (last && last.played === 0) {
    verdict = "<strong>Nobody can play.</strong> Every pair has a responder with nothing to take or a proposer too poor to propose.";
  } else if (sim.latePlayed < 150) {
    const first = sim.turn === 1 && last.rejected ? ` In the first turn, ${last.rejected} of ${last.played} claims were rejected.` : "";
    verdict = `The formula says <strong>${predicted}</strong> of claims will be rejected in the long run.${first}`;
    fine = `Too few games so far to compare (${sim.latePlayed} since turn ${BURN_IN}).`;
  } else {
    verdict = `Since turn ${BURN_IN}, <strong>${pct(sim.lateRejected / sim.latePlayed, 1)}</strong> of claims have been rejected. The formula says ${predicted}.`;
    fine = `Average claim ${pct(sim.lateClaimed / sim.latePlayed)}; the sawtooth predicts about ${pct(eq.meanTake)}, against a tolerance of ${pct(params.tolerance_mean)}.`;
  }
  if (last && last.played > 0 && last.played < params.players / 4 && params.turn_endowment === 0) {
    fine += ` Only ${last.played} of ${params.players / 2} pairs could play this turn: the formula assumes everyone stays in the game, which needs a per-turn payment.`;
  }
  if (sim.turn >= MAX_TURNS) fine += ` Stopped at turn ${MAX_TURNS}.`;
  $("verdict").innerHTML = verdict;
  $("verdict-fine").textContent = fine.trim();
}

let frame = null;
let clock = 0;
let owed = 0;

function loop(now) {
  if (!sim.running) return;
  owed += ((now - clock) / 1000) * sim.speed;
  clock = now;
  let did = 0;
  while (owed >= 1 && did < 4 && sim.running) { advance(); owed -= 1; did += 1; }
  if (owed > 4) owed = 0; // the tab was in the background; do not sprint to catch up
  if (did) render();
  if (sim.running) frame = requestAnimationFrame(loop);
}

function setRunning(on) {
  sim.running = on && sim.turn < MAX_TURNS;
  $("run").textContent = sim.running ? "Pause" : "Run";
  cancelAnimationFrame(frame);
  if (sim.running) { clock = performance.now(); owed = 1; frame = requestAnimationFrame(loop); }
}

function syncControls() {
  SLIDERS.forEach((s) => {
    $(`in-${s.key}`).value = sim.params[s.key];
    $(`out-${s.key}`).textContent = s.show(sim.params[s.key]);
  });
  document.querySelectorAll("#presets button").forEach((b, i) => b.setAttribute("aria-pressed", String(i === sim.preset)));
}

function buildControls() {
  $("presets").innerHTML = PRESETS.map((p, i) => `<button type="button" data-preset="${i}">${p.name}</button>`).join("");
  $("sliders").innerHTML = SLIDERS.map((s) => `<label class="field">
      <span class="row"><span class="label">${s.label}</span><output id="out-${s.key}" for="in-${s.key}"></output></span>
      <input type="range" id="in-${s.key}" name="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}">
    </label>`).join("");

  $("presets").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-preset]");
    if (!b) return;
    sim.preset = Number(b.dataset.preset);
    sim.params = { ...DEFAULTS, ...PRESETS[sim.preset].set };
    syncControls();
    newWorld();
  });
  $("sliders").addEventListener("input", (e) => {
    const s = SLIDERS.find((x) => `in-${x.key}` === e.target.id);
    if (!s) return;
    const value = Number(e.target.value);
    if (!Number.isFinite(value)) return;
    sim.params = { ...sim.params, [s.key]: Math.min(Math.max(value, s.min), s.max) };
    sim.preset = -1;
    syncControls();
    if (s.restart) newWorld(false); else render();
  });
  $("run").addEventListener("click", () => {
    if (sim.turn >= MAX_TURNS) newWorld();
    setRunning(!sim.running);
  });
  $("step").addEventListener("click", () => { setRunning(false); advance(); render(); });
  $("reset").addEventListener("click", () => newWorld());
  $("speed").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-speed]");
    if (!b) return;
    sim.speed = Number(b.dataset.speed);
    $("speed").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  });
  $("controls").addEventListener("submit", (e) => e.preventDefault());
}

/* ---------- Findings ---------- */

let data = null;

function drawFindings() {
  if (!data) return;
  const first = data.first_turn;
  drawLines($("first-chart"), {
    x: [0.3, 0.9], y: [0, 30], labelWidth: 20,
    xLabel: "Take rate proposers start with (responders tolerate about 50%)",
    xFormat: (v) => `${Math.round(v * 100)}%`,
    series: [{ x: first.map((d) => d.take_mean), y: first.map((d) => d.ruined) }],
    points: first.map((d) => ({ x: d.take_mean, y: d.ruined })),
  });

  const curve = data.law_curve;
  drawLines($("law-chart"), {
    x: [0, 1], y: [0, 1], labelWidth: 96, ratio: 0.56,
    xLabel: "Shame: cut in take rate after a rejection",
    xFormat: (v) => `${Math.round(v * 100)}%`, yFormat: (v) => `${Math.round(v * 100)}%`,
    series: curve.greeds.map((g, i) => ({ label: `greed ${Math.round(g * 100)}%`, x: curve.shame, y: curve.rejection_rate[i], dash: DASHES[i % DASHES.length] })),
    points: data.law.map((d) => ({ x: d.shame, y: d.rejection_rate })),
  });

  const turns = data.timeline.no_net.broke.mean.map((_, i) => i + 1);
  const both = (key, yMax, format) => ({
    x: [0, 100], y: [0, yMax], labelWidth: 104, ratio: 0.62, xLabel: "Turn", yFormat: format,
    series: [
      { label: "No safety net", x: turns, y: data.timeline.no_net[key].mean, lo: data.timeline.no_net[key].lo, hi: data.timeline.no_net[key].hi },
      { label: "1 per turn", x: turns, y: data.timeline.net[key].mean, lo: data.timeline.net[key].lo, hi: data.timeline.net[key].hi, dash: DASHES[1] },
    ],
  });
  drawLines($("broke-chart"), both("broke", 60, (v) => v));
  drawLines($("gini-chart"), both("gini", 1, (v) => v.toFixed(1)));
}

function fillFindings() {
  const ruined = data.first_turn.find((d) => d.take_mean === data.defaults.take_mean);
  const row = data.law.find((d) => d.shame === data.defaults.shame && d.greed === data.defaults.greed);
  fill("ruined", Math.round(ruined.ruined));
  fill("after-shame", Math.round(100 * data.defaults.take_mean * (1 - data.defaults.shame)));
  fill("law-default", (100 * rejectionRate(data.defaults.shame, data.defaults.greed)).toFixed(1));
  fill("law-sim", (100 * row.rejection_rate).toFixed(1));
  fill("mean-take", Math.round(100 * row.mean_claim));
  fill("broke-end", Math.round(data.safety_net[0].broke_at_end));
  $("net-table").querySelector("tbody").innerHTML = data.safety_net.map((d) =>
    `<tr><th scope="row">${d.turn_endowment === 0 ? "Nothing" : d.turn_endowment}</th><td class="n">${d.broke_at_end.toFixed(1)}</td><td class="n">${d.games_per_turn.toFixed(1)}</td><td class="n">${d.gini_at_end.toFixed(2)}</td></tr>`).join("");
}

/* ---------- Start ---------- */

async function start() {
  buildControls();
  syncControls();
  newWorld();
  initPaper(() => { render(); });

  let width = innerWidth;
  let timer;
  addEventListener("resize", () => {
    if (innerWidth === width) return;
    width = innerWidth;
    clearTimeout(timer);
    timer = setTimeout(() => { render(); drawFindings(); }, 120);
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) setRunning(false); });

  try {
    const response = await fetch("data/experiments.json");
    if (!response.ok) throw new Error(`experiments.json: ${response.status}`);
    data = await response.json();
    fillFindings();
    drawFindings();
  } catch (error) {
    console.error(error);
    document.querySelectorAll("#findings .chart").forEach((el) => { el.hidden = true; });
  }
}

start();
