import numpy as np

from ultimatum_abm import rng


def test_same_inputs_give_same_outputs():
    a = rng.uint32(42, 3, np.arange(1000))
    b = rng.uint32(42, 3, np.arange(1000))
    assert np.array_equal(a, b)


def test_known_values_pin_the_algorithm():
    # The JavaScript implementation is tested against these same numbers.
    assert rng.uint32(0, 0, np.arange(3)).tolist() == [1680814304, 1471256801, 3260664659]
    assert rng.uint32(7, 100, np.array([0, 59])).tolist() == [29833046, 1845834364]


def test_outputs_fit_in_32_bits_and_look_uniform():
    x = rng.uint32(1, 2, np.arange(200_000))
    assert x.max() < 2**32
    u = rng.uniform(1, 2, np.arange(200_000))
    assert u.min() > 0 and u.max() < 1
    assert abs(u.mean() - 0.5) < 0.005
    counts, _ = np.histogram(u, bins=20, range=(0, 1))
    assert counts.min() > 9_500 and counts.max() < 10_500


def test_seeds_and_streams_are_independent():
    n = np.arange(50_000)
    a = rng.uniform(1, 1, n)
    assert abs(np.corrcoef(a, rng.uniform(2, 1, n))[0, 1]) < 0.02
    assert abs(np.corrcoef(a, rng.uniform(1, 2, n))[0, 1]) < 0.02
    assert abs(np.corrcoef(a[:-1], a[1:])[0, 1]) < 0.02


def test_normal_draws_have_unit_scale():
    z = rng.normal(5, 9, np.arange(200_000))
    assert abs(z.mean()) < 0.01
    assert abs(z.std() - 1) < 0.01
    assert np.isfinite(z).all()
