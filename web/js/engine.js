// The power-to-take game, one world at a time.
//
// This is a line-for-line port of src/ultimatum_abm/model.py. Given the same
// starting population and seed it produces exactly the same numbers, which
// web/test/engine.test.js checks against trajectories exported from Python.

import { uint32, uniform, normal } from "./rng.js";

const STREAM_ENDOWMENT = 1;
const STREAM_TAKE = 2;
const STREAM_TOLERANCE = 3;
const STREAM_TURN = 100;

/** Defaults: the settings of the 2020 NetLogo model. */
export const DEFAULTS = Object.freeze({
  players: 60,
  turns: 100,
  endowment: "normal",
  endowment_mean: 10,
  endowment_sd: 1,
  take_mean: 0.8,
  take_sd: 0.07,
  tolerance_mean: 0.5,
  tolerance_sd: 0.02,
  shame: 0.6,
  greed: 0.05,
  interest: 0.05,
  turn_endowment: 0,
  cost_to_play: 1,
});

const clip01 = (x) => Math.min(Math.max(x, 0), 1);

export function initialPopulation(params, seed) {
  const n = params.players;
  const wealth = new Float64Array(n);
  const take = new Float64Array(n);
  const tolerance = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    let w;
    if (params.endowment === "equal") w = params.endowment_mean;
    else if (params.endowment === "normal") w = params.endowment_mean + params.endowment_sd * normal(seed, STREAM_ENDOWMENT, i);
    else if (params.endowment === "exponential") w = -params.endowment_mean * Math.log(uniform(seed, STREAM_ENDOWMENT, i));
    else throw new Error(`Unknown endowment distribution: ${params.endowment}`);
    wealth[i] = Math.max(w, 0);
    take[i] = clip01(params.take_mean + params.take_sd * normal(seed, STREAM_TAKE, i));
    tolerance[i] = clip01(params.tolerance_mean + params.tolerance_sd * normal(seed, STREAM_TOLERANCE, i));
  }
  return { wealth, take, tolerance };
}

/** Shuffle the players; the first half respond, the second half propose. */
export function pairPlayers(params, seed, turn) {
  const n = params.players;
  const keys = new Array(n);
  const order = new Array(n);
  for (let i = 0; i < n; i += 1) {
    keys[i] = uint32(seed, STREAM_TURN + turn, i);
    order[i] = i;
  }
  order.sort((a, b) => keys[a] - keys[b] || a - b);
  const half = n / 2;
  return { responder: order.slice(0, half), proposer: order.slice(half) };
}

/**
 * Advance the population by one turn, in place. Returns what happened, pair
 * by pair: outcome is "accepted", "rejected" or "idle" (the pair could not play).
 */
export function step(pop, params, seed, turn) {
  const { responder, proposer } = pairPlayers(params, seed, turn);
  const pairs = responder.length;
  const outcome = new Array(pairs);
  const claim = new Float64Array(pairs);
  let played = 0;
  let rejected = 0;
  let claimed = 0;
  let transferred = 0;
  let destroyed = 0;

  for (let k = 0; k < pairs; k += 1) {
    const r = responder[k];
    const p = proposer[k];
    const stake = pop.wealth[r];
    const rate = pop.take[p];
    claim[k] = rate;
    if (!(stake > 0 && pop.wealth[p] >= params.cost_to_play)) {
      outcome[k] = "idle";
      continue;
    }
    played += 1;
    claimed += rate;
    if (rate <= pop.tolerance[r]) {
      const amount = rate * stake;
      pop.wealth[r] = stake - amount;
      pop.wealth[p] += amount;
      pop.take[p] = Math.min(rate * (1 + params.greed), 1);
      transferred += amount;
      outcome[k] = "accepted";
    } else {
      pop.wealth[r] = 0;
      pop.take[p] = rate * (1 - params.shame);
      destroyed += stake;
      rejected += 1;
      outcome[k] = "rejected";
    }
  }

  let total = 0;
  let broke = 0;
  const floor = Math.max(params.cost_to_play, Number.MIN_VALUE);
  for (let i = 0; i < pop.wealth.length; i += 1) {
    pop.wealth[i] = pop.wealth[i] * (1 + params.interest) + params.turn_endowment;
    total += pop.wealth[i];
    if (pop.wealth[i] < floor) broke += 1;
  }
  return { responder, proposer, outcome, claim, played, rejected, claimed, transferred, destroyed, wealth: total, broke };
}

/** Gini coefficient; zero when nobody has anything. */
export function gini(wealth) {
  const x = Array.from(wealth).sort((a, b) => a - b);
  const n = x.length;
  let total = 0;
  let weighted = 0;
  for (let i = 0; i < n; i += 1) {
    total += x[i];
    weighted += x[i] * (i + 1);
  }
  return total > 0 ? (2 * weighted) / (n * total) - (n + 1) / n : 0;
}

/** Check a parameter object the way the Python model does. */
export function validate(params) {
  if (!Number.isInteger(params.players) || params.players < 2 || params.players % 2) throw new Error("players must be an even number, at least 2");
  if (!(params.shame >= 0 && params.shame <= 1)) throw new Error("shame must be between 0 and 1");
  if (!(params.greed >= 0)) throw new Error("greed must not be negative");
  return params;
}
