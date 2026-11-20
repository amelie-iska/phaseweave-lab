"""Refresh the compact, anonymous Numerai Classic assessment."""

from argparse import ArgumentParser
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.request import Request, urlopen

API = "https://api-tournament.numer.ai"
QUERY = """query PhaseWeaveClassicFront {
  leaders: v2Leaderboard(limit: 10, offset: 0) {
    username rank mmc60Rep
  }
  latest: rounds(tournament: 8, limit: 1) {
    number target dataDatestamp openTime closeTime resolveTime
    roundScoreConfigs { displayName version isPayout defaultMultiplier totalScoreDays }
  }
  resolved: rounds(tournament: 8, status: RESOLVED, limit: 1) {
    number target dataDatestamp resolveTime
  }
}"""


def utc():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def write_status(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(mode="w", dir=path.parent, prefix="." + path.name + ".", delete=False) as stream:
        json.dump(value, stream, indent=2, allow_nan=False)
        stream.write("\n")
        name = stream.name
    os.replace(name, path)


def normalize(data):
    if data.get("errors") or not isinstance(data.get("data"), dict):
        raise ValueError("Numerai did not return a complete assessment")
    try:
        raw = data["data"]
        latest, = raw["latest"]
        resolved, = raw["resolved"]
        leaders = raw["leaders"]
        scores = [score for score in latest["roundScoreConfigs"] if score["isPayout"]]
        if (not scores or [r["rank"] for r in leaders] != list(range(1, 11))
                or any(not math.isfinite(r["mmc60Rep"]) or not r["username"] for r in leaders)
                or any(a["mmc60Rep"] < b["mmc60Rep"] for a,b in zip(leaders, leaders[1:]))
                or len({r["username"] for r in leaders}) != 10
                or resolved["number"] > latest["number"]
                or len({s["displayName"] for s in scores}) != len(scores)
                or any(not math.isfinite(s["defaultMultiplier"]) or not s["totalScoreDays"] for s in scores)):
            raise ValueError("Unexpected Classic leaderboard or round score configuration")
        latest = {k: latest[k] for k in ("number", "target", "dataDatestamp", "openTime", "closeTime", "resolveTime")}
        for stamp in (latest["openTime"], latest["closeTime"], latest["resolveTime"], resolved["resolveTime"]):
            if datetime.fromisoformat(stamp).utcoffset() is None:
                raise ValueError("Missing round time zone")
    except (TypeError, KeyError) as exc:
        raise ValueError("Malformed Classic assessment") from exc
    return {"schema": "phaseweave.numerai-front.v1", "checked_utc": utc(),
            "leaderboard_metric": "MMC60 reputation", "latest_round": latest,
            "latest_generally_resolved": resolved, "payout_scores": scores, "leaders": leaders}


def refresh():
    request = Request(API, data=json.dumps({"query": QUERY}).encode(),
                      headers={"Content-Type": "application/json", "User-Agent": "PhaseWeave public Classic assessment"})
    with urlopen(request, timeout=18) as response:
        return normalize(json.load(response))


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    assessment = refresh()
    write_status(args.output, assessment)
    print(f"Verified current Classic round {assessment['latest_round']['number']} and {len(assessment['leaders'])} leading models")


if __name__ == "__main__":
    main()
