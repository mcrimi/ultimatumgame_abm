## WHAT IS IT?

This is a an excercise model that attempts to describe the emergence of cumulative wealth and the distribution of such wealth in an iterative ultimatum game, considering the prosocial emotion of "shame" and profit-maximing "greed",

This  model is inspared by the work of Reuben et al in trying to understand the role of emotions after punishment (in particular shame/guilt) in the take rates of proposers:

https://www.sciencedirect.com/science/article/abs/pii/S0167487010000887?via%3Dihub


## ULTIMATUM GAMES

One player, the proposer, is endowed with a sum of money. The proposer is tasked with splitting it with another player, the responder. Once the proposer communicates their decision, the responder may accept it or reject it. If the responder accepts, the money is split per the proposal; if the responder rejects, both players receive nothing


Ultimatum games: https://en.wikipedia.org/wiki/Ultimatum_game

## HOW IT WORKS
60 players are created and endowed with an initial amount of money - 10 euros. This initial endowment can be taken from a distribution (exponential or normal) or be equal for all the participants. This is controlled by the **initial-endowment-distribution** selector.

Players are also assigned with a take-rate in the case they are proposers (**prop-take-rate**) and one for when they take the roles of responders (**resp-take-rate**). The proposer take rate will determine the offer of the proposer while the responder take rate will determine the amount that the responder agrees to from the proposer to take.

To cater for variabilities in fairness perceptions in the different players the take rates are taken from a normal distribution with mean **mean-take-rate** and **sd-take-rate** both for the responder and proposer rates.

Each turn these players are randomly assigned to the role of responder (red) and proposer (blue) and responders and proposers are paired with each other, also randomly.

If the responder has an endowment and the proposers endowment is more than the **cost-to-play** then a link is established between the two and a proposal is made by the proposer to take an amount of the endowment of the responder according to the **prop-take-rate** of the proposer. 

If the proposed take rate is lower or equal to the what the responder considers fair (**resp-take-rate**) there is a "deal" and the proposed proportion of the responders endowment will pass to the proposer and be deducted from the responders.

If the proposed take rate is larger than the one that the responder considers fair (**resp-take-rate**) there is no deal, and the proposer will set his/her endowment to 0 effectively destroying their wealth.

Those proposers who got they proposal rejected will reduce the prop-take-rate by a percentage corresponding to the **prop-shame-weight** for next time.

Those proposers who got they proposal accepted will increase the prop-take-rate by a percentage corresponding to the **prop-greed-weight** for next time.

For the next turn every player's endowment will be increased by a fixed amount defined by the **turn-endowment** global variable simulating a wellfare endowment. 

Additionally, the current endowment of the players (not considering the wellfare endowment) will be increased by 1+**interest-rate** each turn

The game will end after 100 turns. If no proposals can be made (no proposers can afford the cost-to-play and/or responders have 0 endowment left) the game will end.

## THINGS TO NOTICE

- Which starting point of take rates (both responder and proposer) and combination of adjusting behavior (greed/shame) will be the best agent for a given agent to maximize long term profit.
- Cummulative weatlh - what is the best settings and players strategy to reach the best cumulative wealth?
- Wealth distribution - what is the best settings and players  strategy to achieve the fairest wealth distribution?
- Players out of the game - the amount of players that can no longer play because they can't affor the cost-to-play.
- How many turns does the game last?


## THINGS TO TRY

- Try cost to play = 0 (everyone can propose)
- Explore the relationship between turn-endowment and cost-to-play
- Comapre fixed endowment with interest rate on current endowment and how that affects the wealth distribution

## EXTENDING THE MODEL

- Compare this model with one where the players stick to they roles (once a proposer/responder always a proposer/responder)
- Wellfare endowment could be a proportion of the amount taken from the responders in succesfull operations in each turn. This would simulate an authority redistributing wealth.
- Eplore different distributions in the resp-take-rates and prop-take-rate
- Include and adjusting behavior on the resp-take-rate for the responder after destroying the endowment.
- This model only considers take-rates for the responder decison to wether destroy the endowment or not. It is clear that the abolute value of the take should also be considered.
- Greed and shame weights are assumed to be equal for all participants. These could be drawn from a distribution to add some more randomness to the model.
- This models response in binary terms (destroy all vs accept) . This model could be extended to consider partial endowment destroy.


## RELATED MODELS

Wealth distribution

## CREDITS AND REFERENCES

Author: Mariano Crimi

https://www.sciencedirect.com/science/article/abs/pii/S0167487010000887?via%3Dihub
https://www.nature.com/articles/s41598-017-05122-5
