"""The power-to-take game, vectorised over independent replicate worlds.

Each turn, in every world:

1. Players are shuffled. The first half become responders, the second half
   proposers, and the k-th responder is paired with the k-th proposer.
2. A pair plays if the responder has money and the proposer has at least
   ``cost_to_play``.
3. The proposer claims a share of the responder's money: their take rate.
4. If the claim is within the responder's tolerance, it is paid and the
   proposer grows greedier (take rate times ``1 + greed``, capped at 1).
   Otherwise the responder destroys their own money and the proposer feels
   shame (take rate times ``1 - shame``).
5. Everyone earns interest, then receives the per-turn endowment.

All arrays have shape ``(worlds, players)``.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from typing import Literal

import numpy as np

from ultimatum_abm import rng

# Random streams. Stream numbers 100 and above are one per turn.
STREAM_ENDOWMENT, STREAM_TAKE, STREAM_TOLERANCE = 1, 2, 3
STREAM_TURN = 100


@dataclass(frozen=True)
class Params:
    """Model parameters. Defaults are the settings of the 2020 NetLogo model."""

    players: int = 60
    turns: int = 100
    endowment: Literal["equal", "normal", "exponential"] = "normal"
    endowment_mean: float = 10.0
    endowment_sd: float = 1.0
    take_mean: float = 0.8  # proposers' starting take rate
    take_sd: float = 0.07
    tolerance_mean: float = 0.5  # the largest take rate a responder accepts
    tolerance_sd: float = 0.02
    shame: float = 0.6  # cut in take rate after a rejection
    greed: float = 0.05  # rise in take rate after an acceptance
    interest: float = 0.05
    turn_endowment: float = 0.0  # paid to everyone each turn
    cost_to_play: float = 1.0  # money a proposer needs in order to propose

    def __post_init__(self) -> None:
        if self.players < 2 or self.players % 2:
            raise ValueError("players must be an even number, at least 2")
        if not 0 <= self.shame <= 1:
            raise ValueError("shame must be between 0 and 1")
        if self.greed < 0:
            raise ValueError("greed must not be negative")
        if self.endowment not in ("equal", "normal", "exponential"):
            raise ValueError(f"unknown endowment distribution: {self.endowment}")

    def with_(self, **changes) -> Params:
        return replace(self, **changes)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Population:
    """The state of every player in every world."""

    wealth: np.ndarray
    take: np.ndarray  # take rate claimed when proposing
    tolerance: np.ndarray  # largest take rate accepted when responding

    def copy(self) -> Population:
        return Population(self.wealth.copy(), self.take.copy(), self.tolerance.copy())


@dataclass
class Turn:
    """What happened in one turn. Per-pair arrays have shape ``(worlds, players // 2)``."""

    responder: np.ndarray  # player index of each pair's responder
    proposer: np.ndarray
    played: np.ndarray  # the pair met the conditions to play
    accepted: np.ndarray  # played and the claim was accepted
    claimed: np.ndarray  # take rate claimed (0 where the pair did not play)
    transferred: np.ndarray  # money moved from responder to proposer
    destroyed: np.ndarray  # money the responder destroyed


def initial_population(params: Params, seeds) -> Population:
    """Draw one starting population per seed."""
    seeds = np.atleast_1d(np.asarray(seeds, dtype=np.uint64))[:, None]
    i = np.arange(params.players, dtype=np.uint64)[None, :]

    if params.endowment == "equal":
        wealth = np.full((seeds.shape[0], params.players), params.endowment_mean)
    elif params.endowment == "normal":
        wealth = params.endowment_mean + params.endowment_sd * rng.normal(
            seeds, STREAM_ENDOWMENT, i
        )
    else:
        wealth = -params.endowment_mean * np.log(rng.uniform(seeds, STREAM_ENDOWMENT, i))

    take = params.take_mean + params.take_sd * rng.normal(seeds, STREAM_TAKE, i)
    tolerance = params.tolerance_mean + params.tolerance_sd * rng.normal(
        seeds, STREAM_TOLERANCE, i
    )
    return Population(
        wealth=np.maximum(wealth, 0.0),
        take=np.clip(take, 0.0, 1.0),
        tolerance=np.clip(tolerance, 0.0, 1.0),
    )


def pair_players(params: Params, seeds, turn: int) -> tuple[np.ndarray, np.ndarray]:
    """Shuffle each world's players and split them into responders and proposers."""
    seeds = np.atleast_1d(np.asarray(seeds, dtype=np.uint64))[:, None]
    i = np.arange(params.players, dtype=np.uint64)[None, :]
    keys = rng.uint32(seeds, STREAM_TURN + turn, i)
    order = np.argsort(keys, axis=1, kind="stable")
    half = params.players // 2
    return order[:, :half], order[:, half:]


def step(pop: Population, params: Params, seeds, turn: int) -> Turn:
    """Advance every world by one turn, in place."""
    responder, proposer = pair_players(params, seeds, turn)
    rows = np.arange(pop.wealth.shape[0])[:, None]

    stake = pop.wealth[rows, responder]
    claim = pop.take[rows, proposer]
    played = (stake > 0.0) & (pop.wealth[rows, proposer] >= params.cost_to_play)
    accepted = played & (claim <= pop.tolerance[rows, responder])
    rejected = played & ~accepted

    claimed = np.where(played, claim, 0.0)
    transferred = np.where(accepted, claim * stake, 0.0)
    destroyed = np.where(rejected, stake, 0.0)

    pop.wealth[rows, responder] = np.where(rejected, 0.0, stake - transferred)
    pop.wealth[rows, proposer] += transferred
    pop.take[rows, proposer] = np.where(
        accepted,
        np.minimum(claim * (1.0 + params.greed), 1.0),
        np.where(rejected, claim * (1.0 - params.shame), claim),
    )

    pop.wealth *= 1.0 + params.interest
    pop.wealth += params.turn_endowment
    return Turn(responder, proposer, played, accepted, claimed, transferred, destroyed)


@dataclass
class History:
    """Per-turn summaries of a run. Arrays have shape ``(turns, worlds)``."""

    params: Params
    seeds: np.ndarray
    wealth: np.ndarray  # total wealth after the turn
    mean_take: np.ndarray  # mean take rate over all players
    claimed: np.ndarray  # sum of the take rates claimed in the pairs that played
    played: np.ndarray  # pairs that played
    rejected: np.ndarray  # pairs whose claim was rejected
    transferred: np.ndarray
    destroyed: np.ndarray
    broke: np.ndarray  # players unable to propose after the turn
    gini: np.ndarray
    final: Population

    @property
    def mean_claim(self) -> np.ndarray:
        """Mean take rate actually claimed, per turn and world (NaN when nobody played)."""
        with np.errstate(invalid="ignore", divide="ignore"):
            return np.where(self.played > 0, self.claimed / self.played, np.nan)

    @property
    def rejection_rate(self) -> np.ndarray:
        """Share of played pairs that ended in rejection, per turn and world."""
        with np.errstate(invalid="ignore", divide="ignore"):
            return np.where(self.played > 0, self.rejected / self.played, np.nan)


def gini(wealth: np.ndarray) -> np.ndarray:
    """Gini coefficient of each row. Zero when nobody has anything."""
    x = np.sort(wealth, axis=-1)
    n = x.shape[-1]
    total = x.sum(axis=-1)
    ranks = np.arange(1, n + 1)
    with np.errstate(invalid="ignore", divide="ignore"):
        g = (2.0 * (x * ranks).sum(axis=-1)) / (n * total) - (n + 1) / n
    return np.where(total > 0, g, 0.0)


def run(params: Params, seeds, population: Population | None = None) -> History:
    """Run ``params.turns`` turns in one world per seed.

    Unlike the NetLogo original the run does not stop early when no pair can
    play; such turns simply record zero games, which keeps every world the
    same length.
    """
    seeds = np.atleast_1d(np.asarray(seeds, dtype=np.uint64))
    pop = initial_population(params, seeds) if population is None else population.copy()
    shape = (params.turns, seeds.shape[0])
    names = ("wealth", "mean_take", "claimed", "played", "rejected", "transferred", "destroyed",
             "broke", "gini")
    out = {name: np.zeros(shape) for name in names}

    for t in range(params.turns):
        turn = step(pop, params, seeds, t)
        out["wealth"][t] = pop.wealth.sum(axis=1)
        out["mean_take"][t] = pop.take.mean(axis=1)
        out["claimed"][t] = turn.claimed.sum(axis=1)
        out["played"][t] = turn.played.sum(axis=1)
        out["rejected"][t] = (turn.played & ~turn.accepted).sum(axis=1)
        out["transferred"][t] = turn.transferred.sum(axis=1)
        out["destroyed"][t] = turn.destroyed.sum(axis=1)
        out["broke"][t] = (pop.wealth < max(params.cost_to_play, np.finfo(float).tiny)).sum(axis=1)
        out["gini"][t] = gini(pop.wealth)

    return History(params=params, seeds=seeds, final=pop, **out)
