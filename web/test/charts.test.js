import { test } from "node:test";
import assert from "node:assert/strict";
import { linearScale, linePath, areaPath, spreadLabels, ticks } from "../js/charts.js";

const sx = linearScale([0, 10], [0, 100]);
const sy = linearScale([0, 1], [100, 0]);

test("a line skips gaps instead of drawing through them", () => {
  assert.equal(linePath([0, 5, 10], [0, 0.5, 1], sx, sy), "M0,100L50,50L100,0");
  assert.equal(linePath([0, 5, 10], [0, null, 1], sx, sy), "M0,100M100,0");
  assert.equal(linePath([0, 5], [NaN, NaN], sx, sy), "");
  assert.equal(linePath([], [], sx, sy), "");
});

test("a band is closed and ignores missing values", () => {
  const d = areaPath([0, 5, 10], [0, null, 0.2], [1, 0.9, 0.8], sx, sy);
  assert.ok(d.startsWith("M0,0") && d.endsWith("Z"));
  assert.equal(areaPath([0, 1], [null, null], [1, 1], sx, sy), "");
});

test("labels are pushed apart but stay inside the chart", () => {
  assert.deepEqual(spreadLabels([10, 11, 12], 10, 0, 100), [10, 20, 30]);
  assert.deepEqual(spreadLabels([95, 96, 97], 10, 0, 100), [80, 90, 100]);
  assert.deepEqual(spreadLabels([], 10, 0, 100), []);
});

test("ticks are round numbers inside the range", () => {
  assert.deepEqual(ticks(0, 1, 4), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(ticks(0, 100, 5), [0, 20, 40, 60, 80, 100]);
  assert.deepEqual(ticks(0, 30, 4), [0, 10, 20, 30]);
  assert.deepEqual(ticks(5, 5), [5]);
  assert.ok(ticks(0.3, 0.9, 8).every((t) => t >= 0.3 && t <= 0.9));
});

test("a flat domain does not divide by zero", () => {
  assert.equal(linearScale([3, 3], [0, 100])(3), 0);
});
