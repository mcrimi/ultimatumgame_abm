"""Write the JSON files the web page and its tests read."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from ultimatum_abm.experiments import all_experiments
from ultimatum_abm.model import Params, initial_population, step

FIXTURE_CASES = (
    {"name": "defaults", "seed": 7, "turns": 40, "params": {}},
    {"name": "safety net", "seed": 11, "turns": 60, "params": {"turn_endowment": 1.0}},
    {"name": "mild shame, strong greed", "seed": 3, "turns": 60,
     "params": {"shame": 0.2, "greed": 0.3, "turn_endowment": 0.5, "interest": 0.0}},
    {"name": "exponential wealth, no cost", "seed": 99, "turns": 40,
     "params": {"endowment": "exponential", "cost_to_play": 0.0, "take_mean": 0.45}},
    {"name": "ten players", "seed": 5, "turns": 30,
     "params": {"players": 10, "endowment": "equal", "turn_endowment": 2.0}},
)


def _plain(obj):
    """Convert NumPy containers to plain Python, rounding nothing."""
    if isinstance(obj, dict):
        return {k: _plain(v) for k, v in obj.items()}
    if isinstance(obj, list | tuple):
        return [_plain(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return _plain(obj.tolist())
    if isinstance(obj, np.generic):
        return _plain(obj.item())
    if isinstance(obj, float) and not np.isfinite(obj):
        return None
    return obj


def _round(obj, digits: int):
    if isinstance(obj, dict):
        return {k: _round(v, digits) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_round(v, digits) for v in obj]
    if isinstance(obj, float):
        return float(f"{obj:.{digits}g}")
    return obj


def write_json(obj, path: str | Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":"), allow_nan=False) + "\n")
    return path


def experiments_json(path: str | Path) -> Path:
    return write_json(_round(_plain(all_experiments()), 6), path)


def fixtures() -> dict:
    """Reference trajectories for the JavaScript engine.

    Each case records the starting population and the full state after every
    turn. Floats are written with ``repr`` precision, so they round-trip exactly
    and the JavaScript engine can be required to match them bit for bit.
    """
    cases = []
    for case in FIXTURE_CASES:
        params = Params(turns=case["turns"], **case["params"])
        seeds = np.array([case["seed"]])
        pop = initial_population(params, seeds)
        # Copy: the population is updated in place by the turns below.
        start = _plain({"wealth": pop.wealth[0], "take": pop.take[0],
                        "tolerance": pop.tolerance[0]})
        turns = []
        for t in range(params.turns):
            turn = step(pop, params, seeds, t)
            turns.append({
                "responder": turn.responder[0], "proposer": turn.proposer[0],
                "played": turn.played[0], "accepted": turn.accepted[0],
                "wealth": pop.wealth[0].copy(), "take": pop.take[0].copy(),
            })
        cases.append({"name": case["name"], "seed": case["seed"], "params": params.to_dict(),
                      "start": start, "turns": _plain(turns)})
    return {"cases": cases}


def fixtures_json(path: str | Path) -> Path:
    return write_json(_plain(fixtures()), path)
