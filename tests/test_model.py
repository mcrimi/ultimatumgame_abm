import numpy as np
import pytest

from ultimatum_abm import Params, initial_population, run, step
from ultimatum_abm.model import gini, pair_players

SEEDS = np.arange(1, 41)


def test_a_run_is_reproducible_and_seeds_differ():
    a = run(Params(turns=30), SEEDS)
    b = run(Params(turns=30), SEEDS)
    assert np.array_equal(a.wealth, b.wealth)
    assert np.array_equal(a.final.take, b.final.take)
    assert not np.array_equal(a.wealth[:, 0], a.wealth[:, 1])


def test_worlds_do_not_depend_on_their_batch():
    params = Params(turns=25, turn_endowment=0.5)
    together = run(params, SEEDS)
    alone = run(params, SEEDS[7:8])
    assert np.array_equal(together.final.wealth[7], alone.final.wealth[0])


def test_every_player_is_in_exactly_one_pair():
    params = Params()
    for turn in (0, 1, 50):
        responder, proposer = pair_players(params, SEEDS, turn)
        both = np.sort(np.concatenate([responder, proposer], axis=1), axis=1)
        assert np.array_equal(both, np.tile(np.arange(params.players), (len(SEEDS), 1)))


def test_roles_are_reshuffled_every_turn():
    params = Params()
    first, _ = pair_players(params, SEEDS, 0)
    second, _ = pair_players(params, SEEDS, 1)
    assert not np.array_equal(first, second)
    # Over many turns each player responds about half the time.
    share = np.mean([np.isin(0, pair_players(params, [1], t)[0]) for t in range(400)])
    assert 0.42 < share < 0.58


def test_money_is_only_created_by_interest_and_endowment_and_only_lost_by_destruction():
    params = Params(interest=0.0, turn_endowment=0.0, turns=1)
    pop = initial_population(params, SEEDS)
    before = pop.wealth.sum(axis=1)
    turn = step(pop, params, SEEDS, 0)
    after = pop.wealth.sum(axis=1)
    assert np.allclose(before - turn.destroyed.sum(axis=1), after, rtol=0, atol=1e-9)
    assert (pop.wealth >= 0).all()


def test_transfers_move_the_claimed_share_between_the_pair():
    params = Params(interest=0.0, take_mean=0.3, take_sd=0.0, tolerance_mean=0.5,
                    tolerance_sd=0.0, endowment="equal", turns=1)
    pop = initial_population(params, [1])
    turn = step(pop, params, [1], 0)
    assert turn.accepted.all()
    assert np.allclose(pop.wealth[0, turn.responder[0]], 7.0)
    assert np.allclose(pop.wealth[0, turn.proposer[0]], 13.0)
    assert np.allclose(pop.take[0, turn.proposer[0]], 0.3 * 1.05)
    assert np.allclose(pop.take[0, turn.responder[0]], 0.3)  # responders do not learn


def test_rejection_ruins_the_responder_and_shames_the_proposer():
    params = Params(interest=0.0, take_mean=0.8, take_sd=0.0, tolerance_mean=0.5,
                    tolerance_sd=0.0, endowment="equal", turns=1)
    pop = initial_population(params, [1])
    turn = step(pop, params, [1], 0)
    assert turn.played.all() and not turn.accepted.any()
    assert (pop.wealth[0, turn.responder[0]] == 0).all()
    assert (pop.wealth[0, turn.proposer[0]] == 10).all()
    assert np.allclose(pop.take[0, turn.proposer[0]], 0.8 * 0.4)
    assert turn.destroyed.sum() == 300


def test_a_claim_exactly_at_tolerance_is_accepted():
    params = Params(take_mean=0.5, take_sd=0.0, tolerance_mean=0.5, tolerance_sd=0.0, turns=1)
    assert run(params, [1]).rejected.sum() == 0


def test_broke_players_sit_out_and_their_take_rate_does_not_move():
    params = Params(endowment_mean=0.0, endowment="equal", interest=0.0, turns=5)
    history = run(params, SEEDS)
    assert history.played.sum() == 0
    assert np.array_equal(history.final.take, initial_population(params, SEEDS).take)


def test_take_rates_stay_between_zero_and_one():
    params = Params(greed=0.9, shame=0.05, tolerance_mean=1.0, tolerance_sd=0.0, turns=60)
    final = run(params, SEEDS).final
    assert final.take.min() >= 0 and final.take.max() <= 1
    assert (final.take == 1).any()


def test_initial_populations_respect_their_bounds():
    for kind in ("equal", "normal", "exponential"):
        pop = initial_population(Params(endowment=kind, take_mean=0.99, take_sd=0.3,
                                        tolerance_mean=0.01, tolerance_sd=0.3), SEEDS)
        assert (pop.wealth >= 0).all()
        assert pop.take.min() >= 0 and pop.take.max() <= 1
        assert pop.tolerance.min() >= 0 and pop.tolerance.max() <= 1
    exp = initial_population(Params(endowment="exponential"), np.arange(1, 400)).wealth
    assert abs(exp.mean() - 10) < 0.3


def test_gini_matches_known_cases():
    assert gini(np.array([[1.0, 1.0, 1.0, 1.0]]))[0] == pytest.approx(0)
    assert gini(np.array([[0.0, 0.0, 0.0, 8.0]]))[0] == pytest.approx(0.75)
    assert gini(np.array([[0.0, 0.0, 0.0, 0.0]]))[0] == 0
    assert gini(np.array([[1.0, 2.0, 3.0, 4.0]]))[0] == pytest.approx(0.25)


@pytest.mark.parametrize("bad", [{"players": 7}, {"players": 0}, {"shame": 1.5},
                                 {"greed": -0.1}, {"endowment": "lognormal"}])
def test_impossible_parameters_are_refused(bad):
    with pytest.raises(ValueError):
        Params(**bad)
