# Model description (ODD protocol)

This follows the ODD protocol for describing agent-based models (Grimm et al., 2006; updated
2020): Overview, Design concepts, Details.

## 1. Purpose

To show what a single behavioural finding implies when repeated across a population: that
proposers in a power-to-take game lower their claims after being punished, out of shame
(Reuben and van Winden, 2010). The model asks how claims, rejections and the distribution of
wealth evolve when proposers also grow greedier each time a claim succeeds.

## 2. Entities, state variables and scales

One kind of agent, the **player**. There is no space.

| Variable | Meaning | Changes? |
|---|---|---|
| `wealth` | Money held, at least 0 | Every turn |
| `take` | Share claimed when proposing, in [0, 1] | After each game as proposer |
| `tolerance` | Largest share accepted when responding, in [0, 1] | Never |

Global parameters are listed in `Params` in `src/ultimatum_abm/model.py`. Time advances in
discrete turns; the default run is 60 players for 100 turns.

## 3. Process overview and scheduling

Each turn, in this order:

1. **Pairing.** Players are shuffled. The first half are responders, the second half
   proposers; the k-th responder meets the k-th proposer.
2. **Eligibility.** A pair plays if the responder's wealth is above 0 and the proposer's is
   at least `cost_to_play`. Nothing is charged; it is a threshold.
3. **Game.** If `take` of the proposer is at most `tolerance` of the responder, the claim is
   accepted: `take * wealth` moves from responder to proposer, and the proposer's `take` is
   multiplied by `1 + greed`, capped at 1. Otherwise it is rejected: the responder's wealth
   becomes 0 and the proposer's `take` is multiplied by `1 - shame`.
4. **Income.** Every player's wealth is multiplied by `1 + interest`, then increased by
   `turn_endowment`.

All pairs are resolved simultaneously; since each player is in exactly one pair, order within
a turn does not matter.

## 4. Design concepts

- **Emergence.** The sawtooth in take rates, the long-run rejection rate, and the
  concentration of wealth are not programmed; they follow from the update rules.
- **Adaptation and learning.** Proposers adapt by a fixed multiplicative rule. Responders do
  not adapt.
- **Objectives, prediction, sensing.** None. Players do not optimise, forecast or observe
  anything beyond the outcome of their own game.
- **Interaction.** Pairwise, direct, with a new random partner each turn.
- **Stochasticity.** Initial wealth, take rates and tolerances; and the pairing each turn.
  Everything else is deterministic.
- **Collectives.** None.
- **Observation.** Per turn: games played, rejections, mean claim, money transferred and
  destroyed, players unable to propose, total wealth, Gini coefficient.

## 5. Initialisation

`take` and `tolerance` are drawn from normal distributions (defaults: mean 0.8, sd 0.07, and
mean 0.5, sd 0.02) and clipped to [0, 1]. `wealth` is equal for all, normal (default: mean 10,
sd 1, clipped at 0) or exponential. The defaults are those saved in the 2020 NetLogo file.

## 6. Input data

None.

## 7. Submodels

**Random numbers.** `uint32(seed, stream, counter)` hashes its three arguments with the
MurmurHash3 32-bit finaliser. Streams 1 to 3 initialise wealth, take rate and tolerance;
stream `100 + turn` shuffles the players in that turn, by a stable sort on one hash per
player. Normal draws use Box-Muller. The generator is stateless, so worlds are independent of
how they are batched, and the JavaScript port reproduces it bit for bit.

**Long-run rejection rate.** With `x = log(take)`, an accepted claim adds `log(1 + greed)`
and a rejected one subtracts `-log(1 - shame)`. Boundedness of `take` forces the long-run
drift to zero, giving a rejection rate of
`log(1 + greed) / (log(1 + greed) - log(1 - shame))`. This requires that players keep
playing, which holds when `turn_endowment` is at least `cost_to_play`.

## References

- Grimm, V. et al. (2020). The ODD protocol for describing agent-based and other
  simulation models: a second update. *JASSS* 23(2), 7.
- Reuben, E. and van Winden, F. (2010). Fairness perceptions and prosocial emotions in the
  power to take. *Journal of Economic Psychology* 31(6), 908-922.
