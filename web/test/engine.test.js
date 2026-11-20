import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { uint32, uniform, normal } from "../js/rng.js";
import { DEFAULTS, initialPopulation, pairPlayers, step, gini, validate } from "../js/engine.js";
import { rejectionRate, meanTakeFraction, equilibrium } from "../js/theory.js";

const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const fixtures = load("./fixtures.json");
const experiments = load("../data/experiments.json");

test("the random number generator matches the Python one", () => {
  // The same constants are asserted in tests/test_rng.py.
  assert.deepEqual([0, 1, 2].map((i) => uint32(0, 0, i)), [1680814304, 1471256801, 3260664659]);
  assert.deepEqual([0, 59].map((i) => uint32(7, 100, i)), [29833046, 1845834364]);
});

test("uniform and normal draws are well behaved", () => {
  let sum = 0;
  let squares = 0;
  const n = 100000;
  for (let i = 0; i < n; i += 1) {
    const u = uniform(3, 4, i);
    assert.ok(u > 0 && u < 1);
    const z = normal(3, 5, i);
    sum += z;
    squares += z * z;
  }
  assert.ok(Math.abs(sum / n) < 0.02);
  assert.ok(Math.abs(Math.sqrt(squares / n) - 1) < 0.02);
});

test("starting populations agree with Python to rounding error", () => {
  for (const c of fixtures.cases) {
    const pop = initialPopulation(c.params, c.seed);
    for (const key of ["wealth", "take", "tolerance"]) {
      assert.equal(pop[key].length, c.params.players);
      pop[key].forEach((v, i) => assert.ok(Math.abs(v - c.start[key][i]) < 1e-12, `${c.name} ${key}[${i}]`));
    }
  }
});

test("every turn of every fixture is reproduced exactly", () => {
  assert.ok(fixtures.cases.length >= 5);
  let turns = 0;
  for (const c of fixtures.cases) {
    const pop = {
      wealth: Float64Array.from(c.start.wealth),
      take: Float64Array.from(c.start.take),
      tolerance: Float64Array.from(c.start.tolerance),
    };
    c.turns.forEach((expected, t) => {
      const got = step(pop, c.params, c.seed, t);
      const where = `${c.name}, turn ${t}`;
      assert.deepEqual(got.responder, expected.responder, where);
      assert.deepEqual(got.proposer, expected.proposer, where);
      assert.deepEqual(got.outcome.map((o) => o !== "idle"), expected.played, where);
      assert.deepEqual(got.outcome.map((o) => o === "accepted"), expected.accepted, where);
      // Exact equality: no tolerance.
      assert.deepEqual(Array.from(pop.wealth), expected.wealth, where);
      assert.deepEqual(Array.from(pop.take), expected.take, where);
      turns += 1;
    });
  }
  assert.ok(turns > 200);
});

test("each player is in exactly one pair", () => {
  for (const turn of [0, 1, 77]) {
    const { responder, proposer } = pairPlayers(DEFAULTS, 123, turn);
    const all = [...responder, ...proposer].sort((a, b) => a - b);
    assert.deepEqual(all, Array.from({ length: 60 }, (_, i) => i));
  }
});

test("a turn's totals add up", () => {
  const params = { ...DEFAULTS, interest: 0, turn_endowment: 0 };
  const pop = initialPopulation(params, 9);
  const before = pop.wealth.reduce((a, b) => a + b, 0);
  const turn = step(pop, params, 9, 0);
  assert.ok(Math.abs(before - turn.destroyed - turn.wealth) < 1e-9);
  assert.equal(turn.outcome.filter((o) => o === "rejected").length, turn.rejected);
  assert.equal(turn.outcome.filter((o) => o !== "idle").length, turn.played);
  assert.ok(pop.wealth.every((w) => w >= 0));
});

test("a society with no money plays no games and does not crash", () => {
  const params = { ...DEFAULTS, endowment: "equal", endowment_mean: 0 };
  const pop = initialPopulation(params, 1);
  for (let t = 0; t < 5; t += 1) {
    const turn = step(pop, params, 1, t);
    assert.equal(turn.played, 0);
    assert.equal(turn.broke, 60);
  }
  assert.equal(gini(pop.wealth), 0);
});

test("extreme settings keep take rates between zero and one", () => {
  for (const extra of [{ shame: 1, greed: 0 }, { shame: 0, greed: 5 }, { shame: 0, greed: 0 }, { tolerance_mean: 1, greed: 0.9, shame: 0.01 }]) {
    const params = { ...DEFAULTS, turn_endowment: 1, ...extra };
    const pop = initialPopulation(params, 4);
    for (let t = 0; t < 200; t += 1) step(pop, params, 4, t);
    assert.ok(pop.take.every((x) => x >= 0 && x <= 1 && Number.isFinite(x)));
    assert.ok(pop.wealth.every((x) => x >= 0 && !Number.isNaN(x)));
  }
});

test("gini matches known cases", () => {
  assert.ok(Math.abs(gini([1, 1, 1, 1])) < 1e-12);
  assert.ok(Math.abs(gini([0, 0, 0, 8]) - 0.75) < 1e-12);
  assert.ok(Math.abs(gini([4, 3, 2, 1]) - 0.25) < 1e-12);
});

test("impossible parameters are refused", () => {
  assert.throws(() => validate({ ...DEFAULTS, players: 7 }));
  assert.throws(() => validate({ ...DEFAULTS, shame: 2 }));
  assert.throws(() => validate({ ...DEFAULTS, greed: -1 }));
  assert.throws(() => validate({ ...DEFAULTS, shame: NaN }));
  assert.throws(() => initialPopulation({ ...DEFAULTS, endowment: "lognormal" }, 1));
  assert.equal(validate({ ...DEFAULTS }).players, 60);
});

test("the theory matches Python and its own limits", () => {
  const eq = equilibrium(DEFAULTS);
  assert.ok(Math.abs(eq.rejectionRate - experiments.equilibrium.rejection_rate) < 1e-6);
  assert.ok(Math.abs(eq.meanTake - experiments.equilibrium.mean_take) < 1e-6);
  for (const row of experiments.law) {
    assert.ok(Math.abs(rejectionRate(row.shame, row.greed) - row.predicted_rejection_rate) < 1e-6);
  }
  assert.equal(rejectionRate(1, 0.05), 0);
  assert.equal(rejectionRate(0, 0.05), 1);
  assert.equal(rejectionRate(0.5, 0), 0);
  assert.ok(Number.isNaN(rejectionRate(0, 0)));
  assert.equal(meanTakeFraction(0), 1);
  assert.equal(meanTakeFraction(1), 0);
  assert.equal(equilibrium({ ...DEFAULTS, greed: 0 }).cycleLength, Infinity);
});

test("the browser engine obeys the rejection-rate law", () => {
  const params = { ...DEFAULTS, turn_endowment: 1 };
  let played = 0;
  let rejected = 0;
  for (let seed = 1; seed <= 20; seed += 1) {
    const pop = initialPopulation(params, seed);
    for (let t = 0; t < 400; t += 1) {
      const turn = step(pop, params, seed, t);
      if (t >= 150) { played += turn.played; rejected += turn.rejected; }
    }
  }
  assert.ok(Math.abs(rejected / played - equilibrium(params).rejectionRate) < 0.006);
});
