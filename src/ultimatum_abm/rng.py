"""A counter-based random number generator that is identical in Python and JavaScript.

The web page runs this model in the browser. To be able to test that the
browser runs *the same* model, both implementations draw their randomness from
this generator: a pure function of (seed, stream, counter) built only from
32-bit integer operations, which NumPy and JavaScript evaluate bit for bit
alike. There is no hidden state, so it is also trivially vectorised.

It is a hash, not a cryptographic generator, and is meant for simulation only.
"""

from __future__ import annotations

import numpy as np

MASK = np.uint64(0xFFFFFFFF)
GOLDEN = np.uint64(0x9E3779B9)


def _mix(x: np.ndarray) -> np.ndarray:
    """The 32-bit finaliser of MurmurHash3. Arithmetic is done in uint64 and masked."""
    x = x & MASK
    x ^= x >> np.uint64(16)
    x = (x * np.uint64(0x85EBCA6B)) & MASK
    x ^= x >> np.uint64(13)
    x = (x * np.uint64(0xC2B2AE35)) & MASK
    x ^= x >> np.uint64(16)
    return x


def uint32(seed, stream, counter) -> np.ndarray:
    """Uniform 32-bit integers. Arguments broadcast against each other."""
    seed = np.asarray(seed, dtype=np.uint64)
    stream = np.asarray(stream, dtype=np.uint64)
    counter = np.asarray(counter, dtype=np.uint64)
    h = _mix(seed ^ GOLDEN)
    h = _mix(h ^ ((stream * np.uint64(0x85EBCA77)) & MASK))
    h = _mix(h ^ ((counter * np.uint64(0xC2B2AE3D)) & MASK))
    return h


def uniform(seed, stream, counter) -> np.ndarray:
    """Uniform floats in the open interval (0, 1)."""
    return (uint32(seed, stream, counter).astype(np.float64) + 0.5) / 4294967296.0


def normal(seed, stream, counter) -> np.ndarray:
    """Standard normal draws by Box-Muller. Each draw consumes counters 2k and 2k+1."""
    counter = np.asarray(counter, dtype=np.uint64)
    u1 = uniform(seed, stream, counter * np.uint64(2))
    u2 = uniform(seed, stream, counter * np.uint64(2) + np.uint64(1))
    return np.sqrt(-2.0 * np.log(u1)) * np.cos(2.0 * np.pi * u2)
