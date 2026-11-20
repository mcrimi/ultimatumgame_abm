// Counter-based random numbers, bit-for-bit identical to src/ultimatum_abm/rng.py.
// A pure function of (seed, stream, counter) using only 32-bit integer maths.

function mix(x) {
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/** A uniform 32-bit unsigned integer. */
export function uint32(seed, stream, counter) {
  let h = mix((seed ^ 0x9e3779b9) >>> 0);
  h = mix((h ^ Math.imul(stream, 0x85ebca77)) >>> 0);
  h = mix((h ^ Math.imul(counter, 0xc2b2ae3d)) >>> 0);
  return h;
}

/** A uniform float in the open interval (0, 1). */
export function uniform(seed, stream, counter) {
  return (uint32(seed, stream, counter) + 0.5) / 4294967296;
}

/** A standard normal draw (Box-Muller); uses counters 2k and 2k + 1. */
export function normal(seed, stream, counter) {
  const u1 = uniform(seed, stream, 2 * counter);
  const u2 = uniform(seed, stream, 2 * counter + 1);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
