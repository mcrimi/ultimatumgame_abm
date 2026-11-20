import numpy as np
import pytest

from ultimatum_abm import Params, equilibrium, initial_population, run, step
from ultimatum_abm.experiments import long_run
from ultimatum_abm.theory import mean_take_fraction, rejection_rate


@pytest.mark.parametrize(("shame", "greed"), [(0.6, 0.05), (0.3, 0.05), (0.1, 0.1),
                                              (0.8, 0.2), (0.5, 0.3)])
def test_the_rejection_rate_law_holds_in_simulation(shame, greed):
    params = Params(shame=shame, greed=greed, turn_endowment=1.0, turns=400)
    simulated = long_run(run(params, np.arange(1, 201)))["rejection_rate"]
    assert simulated == pytest.approx(equilibrium(params).rejection_rate, abs=0.004)


def test_tolerance_does_not_change_the_rejection_rate():
    rates = [long_run(run(Params(tolerance_mean=m, turn_endowment=1.0, turns=400),
                          np.arange(1, 201)))["rejection_rate"] for m in (0.2, 0.5, 0.8)]
    assert max(rates) - min(rates) < 0.004


def test_the_average_take_follows_the_sawtooth_when_greed_is_small():
    params = Params(greed=0.02, turn_endowment=1.0, turns=600)
    simulated = long_run(run(params, np.arange(1, 201)), burn_in=300)["mean_claim"]
    assert simulated == pytest.approx(equilibrium(params).mean_take, rel=0.03)


def test_more_shame_means_fewer_rejections_and_smaller_takes():
    shame = np.linspace(0.05, 0.95, 19)
    assert (np.diff(rejection_rate(shame, 0.05)) < 0).all()
    assert (np.diff(mean_take_fraction(shame)) < 0).all()
    assert (np.diff(rejection_rate(0.5, np.linspace(0.01, 0.5, 20))) > 0).all()


def test_limits():
    assert rejection_rate(1.0, 0.05) == 0  # total shame: never rejected again
    assert rejection_rate(0.0, 0.05) == 1  # no shame: proposers never back down
    assert rejection_rate(0.5, 0.0) == 0  # no greed: nobody pushes
    assert np.isnan(rejection_rate(0.0, 0.0))
    assert mean_take_fraction(0.0) == 1
    assert mean_take_fraction(1.0) == 0
    eq = equilibrium(Params())
    assert eq.cycle_length == pytest.approx(1 / eq.rejection_rate)
    assert eq.floor == pytest.approx(0.2)


def test_without_a_safety_net_ruin_is_permanent():
    params = Params(turn_endowment=0.0)
    seeds = np.arange(1, 101)
    pop = initial_population(params, seeds)
    first = step(pop, params, seeds, 0)
    assert (first.played & ~first.accepted).sum(axis=1).mean() > 29  # nearly every responder
    ruined = pop.wealth == 0
    for turn in range(1, 60):
        step(pop, params, seeds, turn)
        assert (pop.wealth[ruined] == 0).all()  # interest on nothing is nothing
        ruined = pop.wealth == 0

    assert run(params, seeds).broke[-1].mean() > 40
    assert run(params.with_(turn_endowment=1.0), seeds).broke[-1].mean() == 0
