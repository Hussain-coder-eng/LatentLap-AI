#!/usr/bin/env python3
"""
Phase 7 — Strategy Advisor

Reads outputs/predictions.json (Phase 5) and writes
outputs/strategy_recommendations.json.

Usage:
  ~/.venv/bin/python strategy.py
  ~/.venv/bin/python strategy.py --year 2022 --driver NOR
  ~/.venv/bin/python strategy.py --current-lap 24
  ~/.venv/bin/python strategy.py --dry-run
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Sequence

import numpy as np

# -- Paths ---------------------------------------------------------------------
OUTPUTS_DIR      = Path("outputs")
PREDICTIONS_PATH = OUTPUTS_DIR / "predictions.json"
STRATEGY_PATH    = OUTPUTS_DIR / "strategy_recommendations.json"

# -- Pit simulation constants --------------------------------------------------
CANDIDATE_PIT_LAPS: list[int] = [18, 20, 22, 24, 26]
FRESH_TIRE_BASELINE: float     = 0.3   # assumed severity immediately after pit
RACE_LAPS: int                 = 52    # Silverstone GP lap count

# -- Pit window thresholds -----------------------------------------------------
DEFAULT_IDEAL_THRESHOLD:       float = 2.0
DEFAULT_ACCEPTABLE_THRESHOLD:  float = 2.5
DEFAULT_ANOMALY_THRESHOLD:     float = 0.5

# -- Confidence thresholds -----------------------------------------------------
HIGH_CONFIDENCE_LAP_MIN:   int = 30
MEDIUM_CONFIDENCE_LAP_MIN: int = 15
MIN_LAPS_FOR_FIT:          int = 5


def fit_degradation_curve(
    lap_numbers: Sequence[int | float],
    severities:  Sequence[float],
) -> np.ndarray:
    """Fit degree-2 polynomial to (lap, severity) pairs.

    Returns np.ndarray shape (3,): [c2, c1, c0] (highest power first).
    Raises ValueError if fewer than MIN_LAPS_FOR_FIT points supplied.
    """
    if len(lap_numbers) < MIN_LAPS_FOR_FIT:
        raise ValueError(
            f"insufficient data: need >={MIN_LAPS_FOR_FIT} laps, got {len(lap_numbers)}"
        )
    return np.polyfit(lap_numbers, severities, deg=2)


def extrapolate_finish_severity(
    coeffs:              np.ndarray,
    pit_lap:             int,
    race_laps:           int,
    fresh_tire_baseline: float,
) -> float:
    """Estimate severity at race end assuming pit at pit_lap.

    Model: post_pit_severity(L) = baseline + (p(L) - p(pit_lap + 1))
    Preserves degradation curve shape anchored at fresh_tire_baseline.
    Result clamped to [0.0, 3.0].

    Later pit => lower finish severity (fewer fresh-tire laps consumed).
    """
    p = np.poly1d(coeffs)
    anchor = float(p(pit_lap + 1))
    finish = float(p(race_laps))
    raw = fresh_tire_baseline + (finish - anchor)
    return float(np.clip(raw, 0.0, 3.0))


def tag_recommendation(
    finish_severity:      float,
    ideal_threshold:      float,
    acceptable_threshold: float,
) -> str:
    """Classify a strategy by its projected finish severity."""
    if finish_severity <= ideal_threshold:
        return "optimal"
    if finish_severity <= acceptable_threshold:
        return "acceptable"
    if finish_severity < 3.0:
        return "late"
    return "critical"


def compute_pit_window(
    strategies:           list[dict],
    ideal_threshold:      float,
    acceptable_threshold: float,
) -> dict[str, int]:
    """Return first/last consecutive pit laps with finish_severity <= ideal_threshold.

    strategies must be sorted ascending by pit_lap.
    Falls back to first candidate lap if none qualify.
    """
    qualifying = [s["pit_lap"] for s in strategies if s["finish_severity"] <= ideal_threshold]
    if not qualifying:
        return {"start": strategies[0]["pit_lap"], "end": strategies[0]["pit_lap"]}
    return {"start": qualifying[0], "end": qualifying[-1]}


def score_confidence(n_laps: int) -> str:
    """Classify curve-fit confidence by number of observed laps."""
    if n_laps >= HIGH_CONFIDENCE_LAP_MIN:
        return "high"
    if n_laps >= MEDIUM_CONFIDENCE_LAP_MIN:
        return "medium"
    return "low"


def build_driver_recommendation(
    lap_records:          list[dict],
    current_lap:          int,
    ideal_threshold:      float = DEFAULT_IDEAL_THRESHOLD,
    acceptable_threshold: float = DEFAULT_ACCEPTABLE_THRESHOLD,
) -> dict:
    """Build strategy recommendation for one (year, driver) pair.

    lap_records: list of {"lap_number": int, "severity_pred": float}, any order.
    current_lap: only laps 1..current_lap used for curve fitting.
    """
    observed = sorted(
        [r for r in lap_records if r["lap_number"] <= current_lap],
        key=lambda r: r["lap_number"],
    )

    if len(observed) < MIN_LAPS_FOR_FIT:
        fallback = CANDIDATE_PIT_LAPS[0]
        return {
            "current_lap":        current_lap,
            "current_severity":   None,
            "pit_strategies":     [
                {
                    "pit_lap":          fallback,
                    "finish_severity":  None,
                    "recommendation":   "optimal",
                    "pit_window_start": fallback,
                    "pit_window_end":   fallback,
                }
            ],
            "primary_pit_window": {"start": fallback, "end": fallback},
            "confidence":         "low",
        }

    laps   = [r["lap_number"]    for r in observed]
    sevs   = [r["severity_pred"] for r in observed]
    coeffs = fit_degradation_curve(laps, sevs)

    current_severity = round(float(np.poly1d(coeffs)(current_lap)), 4)

    strategies = []
    for pit_lap in CANDIDATE_PIT_LAPS:
        finish_sev = extrapolate_finish_severity(
            coeffs, pit_lap, RACE_LAPS, FRESH_TIRE_BASELINE
        )
        strategies.append({
            "pit_lap":         pit_lap,
            "finish_severity": round(finish_sev, 4),
            "recommendation":  tag_recommendation(finish_sev, ideal_threshold, acceptable_threshold),
        })

    window = compute_pit_window(strategies, ideal_threshold, acceptable_threshold)
    for s in strategies:
        s["pit_window_start"] = window["start"]
        s["pit_window_end"]   = window["end"]

    return {
        "current_lap":        current_lap,
        "current_severity":   current_severity,
        "pit_strategies":     strategies,
        "primary_pit_window": window,
        "confidence":         score_confidence(len(observed)),
    }


def generate_strategy_json(
    predictions_path:     Path = PREDICTIONS_PATH,
    output_path:          Path = STRATEGY_PATH,
    year_filter:          int | None = None,
    driver_filter:        str | None = None,
    current_lap_override: int | None = None,
    dry_run:              bool = False,
) -> dict:
    """Load predictions -> build recommendations -> write JSON.

    Returns output dict always (even in dry_run).
    Raises FileNotFoundError if predictions_path absent.
    """
    if not predictions_path.exists():
        raise FileNotFoundError(
            f"{predictions_path} not found. Run evaluate.py first (Phase 5)."
        )

    raw      = json.loads(predictions_path.read_text())
    all_laps = raw["laps"]

    groups: dict[int, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    for lap in all_laps:
        y, drv = int(lap["year"]), lap["driver"]
        if year_filter is not None and y != year_filter:
            continue
        if driver_filter is not None and drv != driver_filter:
            continue
        groups[y][drv].append({
            "lap_number":    lap["lap_number"],
            "severity_pred": lap["severity_pred"],
        })

    output: dict[str, dict] = {}
    for year in sorted(groups):
        output[str(year)] = {}
        for driver in sorted(groups[year]):
            records     = groups[year][driver]
            current_lap = current_lap_override or max(r["lap_number"] for r in records)
            rec         = build_driver_recommendation(records, current_lap)
            output[str(year)][driver] = rec
            print(
                f"  {year} {driver}: pit window {rec['primary_pit_window']}, "
                f"confidence={rec['confidence']}"
            )

    if dry_run:
        print(json.dumps(output, indent=2))
    else:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(output, indent=2))
        print(f"Written -> {output_path}")

    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Phase 7 -- Strategy Advisor")
    parser.add_argument("--year",        type=int, default=None)
    parser.add_argument("--driver",      type=str, default=None)
    parser.add_argument("--current-lap", type=int, default=None, dest="current_lap",
                        help="Override current lap (simulate mid-race state)")
    parser.add_argument("--dry-run",     action="store_true",
                        help="Print JSON to stdout, do not write file")
    args = parser.parse_args()

    generate_strategy_json(
        year_filter=args.year,
        driver_filter=args.driver,
        current_lap_override=args.current_lap,
        dry_run=args.dry_run,
    )
