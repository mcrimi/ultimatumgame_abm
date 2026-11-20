import json

import numpy as np

from ultimatum_abm.export import _plain, _round, fixtures, write_json
from ultimatum_abm.model import Params, initial_population, run


def test_fixtures_agree_with_a_fresh_run():
    case = fixtures()["cases"][1]
    params = Params(**case["params"])
    history = run(params, [case["seed"]])
    assert np.array_equal(history.final.wealth[0], np.array(case["turns"][-1]["wealth"]))
    assert len(case["turns"]) == params.turns
    assert len(case["start"]["wealth"]) == params.players
    # The recorded start is the population before any turn was played.
    start = initial_population(params, [case["seed"]])
    assert np.array_equal(start.wealth[0], np.array(case["start"]["wealth"]))
    assert np.array_equal(start.take[0], np.array(case["start"]["take"]))


def test_json_round_trips_floats_exactly(tmp_path):
    values = [0.1 + 0.2, 1 / 3, 1e-300, 123456789.123456789]
    path = write_json(_plain({"x": np.array(values)}), tmp_path / "x.json")
    assert json.loads(path.read_text())["x"] == values


def test_non_finite_numbers_become_null_and_rounding_keeps_structure():
    assert _plain({"a": float("nan"), "b": np.float64("inf"), "c": np.int64(3)}) == {
        "a": None, "b": None, "c": 3}
    assert _round({"a": [1.23456789, 2], "b": "x"}, 3) == {"a": [1.23, 2], "b": "x"}
