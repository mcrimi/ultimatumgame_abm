"""What the model's learning rule implies, worked out without simulating.

A proposer's take rate is multiplied by ``1 + greed`` after an acceptance and
by ``1 - shame`` after a rejection. In logarithms that is a walk: up by
``L_greed = log(1 + greed)`` when accepted, down by ``L_shame = -log(1 - shame)``
when rejected. Over a long run the ups and downs must cancel, which pins the
share of proposals that are rejected::

    rejection rate = L_greed / (L_greed + L_shame)

It depends on shame and greed alone. How tolerant the responders are does not
enter; tolerance only sets the level at which the walk turns round.

When responders' tolerances are similar the walk is a sawtooth, the same shape
as TCP congestion control: the take rate creeps up until it crosses what
responders tolerate (the ceiling), is rejected, and drops to ``ceiling * (1 -
shame)`` (the floor). Averaged over a cycle the claim is about::

    mean take = ceiling * shame / L_shame

so the more shame proposers feel, the more money they leave on the table.

These results assume every pair keeps playing. They hold when a per-turn
endowment keeps ruined players in the game, and break down without one.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ultimatum_abm.model import Params


@dataclass(frozen=True)
class Equilibrium:
    rejection_rate: float
    cycle_length: float  # turns from one rejection to the next
    ceiling: float  # take rate at which responders start to reject
    floor: float  # take rate just after a rejection
    mean_take: float  # average claim over a cycle


def rejection_rate(shame, greed):
    """Long-run share of proposals rejected. Works on arrays."""
    shame = np.asarray(shame, dtype=float)
    greed = np.asarray(greed, dtype=float)
    up = np.log1p(greed)
    with np.errstate(divide="ignore", invalid="ignore"):
        down = -np.log1p(-shame)
        rate = np.where(np.isinf(down), 0.0, up / (up + down))
        # Total shame sends the take rate to zero for good: nothing is rejected again.
        # No shame and no greed: take rates never move, so there is no long-run law.
        return np.where((up == 0) & (down == 0), np.nan, rate)


def mean_take_fraction(shame):
    """Average claim as a fraction of the ceiling: shame / -log(1 - shame)."""
    shame = np.asarray(shame, dtype=float)
    with np.errstate(divide="ignore", invalid="ignore"):
        down = -np.log1p(-shame)
        return np.where(shame == 0, 1.0, np.where(np.isinf(down), 0.0, shame / down))


def equilibrium(params: Params) -> Equilibrium:
    reject = float(rejection_rate(params.shame, params.greed))
    ceiling = params.tolerance_mean
    return Equilibrium(
        rejection_rate=reject,
        cycle_length=1.0 / reject if reject > 0 else float("inf"),
        ceiling=ceiling,
        floor=ceiling * (1.0 - params.shame),
        mean_take=float(ceiling * mean_take_fraction(params.shame)),
    )
