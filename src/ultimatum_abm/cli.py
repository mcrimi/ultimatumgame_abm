"""Command line: ``ultimatum-abm build`` and ``ultimatum-abm run``."""

from __future__ import annotations

import argparse
from dataclasses import fields

import numpy as np

from ultimatum_abm.experiments import long_run
from ultimatum_abm.export import experiments_json, fixtures_json
from ultimatum_abm.model import Params, run
from ultimatum_abm.theory import equilibrium


def _build(args: argparse.Namespace) -> None:
    print("wrote", experiments_json(f"{args.out}/data/experiments.json"))
    print("wrote", fixtures_json(f"{args.out}/test/fixtures.json"))


def _run(args: argparse.Namespace) -> None:
    overrides = {f.name: getattr(args, f.name) for f in fields(Params)
                 if getattr(args, f.name) is not None}
    params = Params(**overrides)
    history = run(params, np.arange(1, args.worlds + 1))
    eq = equilibrium(params)
    summary = long_run(history, burn_in=min(params.turns // 2, 150))
    print(f"{args.worlds} worlds, {params.turns} turns")
    print(f"  rejection rate   simulated {summary['rejection_rate']:.4f}   "
          f"predicted {eq.rejection_rate:.4f}")
    print(f"  mean take rate   simulated {summary['mean_claim']:.4f}   "
          f"predicted {eq.mean_take:.4f}")
    print(f"  games per turn   {summary['games_per_turn']:.1f} of {params.players // 2}")
    print(f"  players broke    {history.broke[-1].mean():.1f} of {params.players}")
    print(f"  Gini at the end  {history.gini[-1].mean():.3f}")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="ultimatum-abm", description=__doc__)
    sub = parser.add_subparsers(required=True)

    build = sub.add_parser("build", help="run every experiment and write the web page's JSON")
    build.add_argument("--out", default="web")
    build.set_defaults(func=_build)

    one = sub.add_parser("run", help="simulate one parameter setting and print a summary")
    one.add_argument("--worlds", type=int, default=200)
    for f in fields(Params):
        kind = str if f.name == "endowment" else type(f.default)
        one.add_argument(f"--{f.name.replace('_', '-')}", dest=f.name, type=kind, default=None)
    one.set_defaults(func=_run)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
