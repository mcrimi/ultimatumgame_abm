// The model's long-run behaviour in closed form. Mirrors src/ultimatum_abm/theory.py.

/** Long-run share of proposals rejected: log(1+g) / (log(1+g) - log(1-s)). */
export function rejectionRate(shame, greed) {
  const up = Math.log1p(greed);
  const down = -Math.log1p(-shame);
  if (up === 0 && down === 0) return NaN;
  if (!Number.isFinite(down)) return 0;
  return up / (up + down);
}

/** Average claim as a fraction of the ceiling: s / -log(1-s). */
export function meanTakeFraction(shame) {
  if (shame === 0) return 1;
  const down = -Math.log1p(-shame);
  return Number.isFinite(down) ? shame / down : 0;
}

export function equilibrium(params) {
  const reject = rejectionRate(params.shame, params.greed);
  const ceiling = params.tolerance_mean;
  return {
    rejectionRate: reject,
    cycleLength: reject > 0 ? 1 / reject : Infinity,
    ceiling,
    floor: ceiling * (1 - params.shame),
    meanTake: ceiling * meanTakeFraction(params.shame),
  };
}
