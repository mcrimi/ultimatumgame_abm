"""The experiments behind the report and the web page.

Every experiment is a pure function of its arguments and fixed seeds, so the
exported numbers are reproducible to the last digit.
"""

from __future__ import annotations

import numpy as np

from ultimatum_abm.model import History, Params, run
from ultimatum_abm.theory import equilibrium, rejection_rate

WORLDS = 500
SAFETY_NET = 1.0  # per-turn endowment used wherever players must stay in the game
BURN_IN = 150
LONG_RUN = 400

SHAMES = (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9)
GREEDS = (0.02, 0.05, 0.1, 0.2, 0.3)
ENDOWMENTS = (0.0, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0)
STARTING_TAKES = (0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9)


def _seeds(worlds: int = WORLDS) -> np.ndarray:
    return np.arange(1, worlds + 1)


def _band(x: np.ndarray) -> dict:
    """Mean and 10th-90th percentile across worlds, per turn."""
    lo, hi = np.nanpercentile(x, [10, 90], axis=1)
    return {"mean": np.nanmean(x, axis=1), "lo": lo, "hi": hi}


def long_run(history: History, burn_in: int = BURN_IN) -> dict:
    """Pooled long-run rates after discarding the first ``burn_in`` turns."""
    late = slice(burn_in, None)
    played = history.played[late].sum()
    moved = history.transferred[late].sum()
    burnt = history.destroyed[late].sum()
    return {
        "rejection_rate": float(history.rejected[late].sum() / played) if played else float("nan"),
        "mean_claim": float(history.claimed[late].sum() / played) if played else float("nan"),
        "destroyed_share": float(burnt / (burnt + moved)) if burnt + moved else float("nan"),
        "games_per_turn": float(history.played[late].mean()),
    }


def timeline(params: Params, worlds: int = WORLDS) -> dict:
    """Turn-by-turn course of a society, summarised across worlds."""
    h = run(params, _seeds(worlds))
    return {
        "params": params.to_dict(),
        "worlds": worlds,
        "played": _band(h.played),
        "rejected": _band(h.rejected),
        "broke": _band(h.broke),
        "mean_claim": _band(h.mean_claim),
        "gini": _band(h.gini),
        "wealth": _band(h.wealth),
    }


def law_grid(worlds: int = 200) -> list[dict]:
    """Simulated against predicted long-run rates over a grid of shame and greed."""
    rows = []
    for greed in GREEDS:
        for shame in SHAMES:
            params = Params(shame=shame, greed=greed, turn_endowment=SAFETY_NET, turns=LONG_RUN)
            eq = equilibrium(params)
            rows.append({
                "shame": shame, "greed": greed,
                "predicted_rejection_rate": eq.rejection_rate,
                "predicted_mean_claim": eq.mean_take,
                **long_run(run(params, _seeds(worlds))),
            })
    return rows


def safety_net(worlds: int = WORLDS) -> list[dict]:
    """What a per-turn endowment does to a society that starts out too greedy."""
    rows = []
    for endowment in ENDOWMENTS:
        params = Params(turn_endowment=endowment)
        h = run(params, _seeds(worlds))
        rows.append({
            "turn_endowment": endowment,
            "broke_at_end": float(h.broke[-1].mean()),
            "games_per_turn": float(h.played[20:].mean()),
            "destroyed_total": float(h.destroyed.sum(axis=0).mean()),
            "gini_at_end": float(h.gini[-1].mean()),
            "wealth_at_end": float(np.median(h.wealth[-1])),
        })
    return rows


def first_turn(worlds: int = WORLDS) -> list[dict]:
    """How many responders are ruined in the very first turn, by starting take rate."""
    rows = []
    for take in STARTING_TAKES:
        h = run(Params(take_mean=take, turns=1), _seeds(worlds))
        rows.append({"take_mean": take, "ruined": float(h.rejected[0].mean()),
                     "pairs": Params().players // 2})
    return rows


def all_experiments() -> dict:
    defaults = Params()
    return {
        "defaults": defaults.to_dict(),
        "equilibrium": equilibrium(defaults).__dict__,
        "timeline": {
            "no_net": timeline(defaults),
            "net": timeline(defaults.with_(turn_endowment=SAFETY_NET)),
        },
        "law": law_grid(),
        "law_curve": {
            "greeds": list(GREEDS),
            "shame": [s / 100 for s in range(2, 99)],
            "rejection_rate": [
                rejection_rate([s / 100 for s in range(2, 99)], g).tolist() for g in GREEDS
            ],
        },
        "safety_net": safety_net(),
        "first_turn": first_turn(),
    }
